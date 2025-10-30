use bytemuck::{from_bytes, from_bytes_mut, Pod, Zeroable};
use mpl_utils::{
    assert_derivation, assert_owned_by, assert_signer, cmp_pubkeys, create_or_allocate_account_raw,
};
use shank::{ShankAccounts, ShankType};
use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, program::invoke,
    program_error::ProgramError, system_program, sysvar::Sysvar,
};
use spl_token::instruction::transfer;

use crate::{
    error::BglLegitError,
    state::{StakeAccount, StakingPool, STAKE_PREFIX},
};

#[repr(C)]
#[derive(PartialEq, Eq, Debug, Clone, ShankType, Pod, Zeroable, Copy)]
pub struct CreateStakeV1Args {
    #[skip]
    /// The discriminator for the instruction
    discriminator: u8,

    /// The type of staker (0=MachineOwner, 1=GameCreator)
    pub staker_type: u8,

    /// Padding for alignment
    _padding: [u8; 6],

    /// Amount to stake
    pub amount: u64,
}

#[derive(ShankAccounts)]
pub struct CreateStakeV1Accounts<'a> {
    #[account(writable, desc = "The staking pool account")]
    pool: &'a AccountInfo<'a>,

    #[account(writable, desc = "The stake account to create")]
    stake_account: &'a AccountInfo<'a>,

    #[account(writable, signer, desc = "The staker")]
    staker: &'a AccountInfo<'a>,

    #[account(writable, desc = "The staker's token account")]
    staker_token_account: &'a AccountInfo<'a>,

    #[account(writable, desc = "The pool's vault token account")]
    vault: &'a AccountInfo<'a>,

    #[account(writable, signer, desc = "The account paying for storage fees")]
    payer: &'a AccountInfo<'a>,

    #[account(desc = "The SPL Token program")]
    token_program: &'a AccountInfo<'a>,

    #[account(desc = "The system program")]
    system_program: &'a AccountInfo<'a>,
}

impl CreateStakeV1Accounts<'_> {
    pub fn check(&self, args: &CreateStakeV1Args) -> Result<u8, ProgramError> {
        let Self {
            pool,
            stake_account,
            staker,
            staker_token_account,
            vault: _,
            payer,
            token_program,
            system_program,
        } = self;

        // Verify amount > 0
        if args.amount == 0 {
            return Err(BglLegitError::InsufficientStakeAmount.into());
        }

        // Verify pool is owned by this program
        assert_owned_by(pool, &crate::ID, BglLegitError::InvalidPoolAccount)?;

        // Verify pool has correct size
        if pool.data_len() != core::mem::size_of::<StakingPool>() {
            return Err(BglLegitError::InvalidPoolAccount.into());
        }

        // Verify stake_account PDA derivation
        let stake_bump = assert_derivation(
            &crate::ID,
            stake_account,
            &[STAKE_PREFIX, pool.key.as_ref(), staker.key.as_ref()],
            BglLegitError::InvalidStakeAccountPdaDerivation,
        )?;

        // Verify staker is signer
        assert_signer(staker).map_err(|_| BglLegitError::StakerMustSign)?;

        // Verify payer is signer
        assert_signer(payer).map_err(|_| BglLegitError::PayerMustSign)?;

        // Verify token_program is SPL Token program
        if !cmp_pubkeys(token_program.key, &spl_token::ID) {
            return Err(BglLegitError::InvalidSplTokenProgram.into());
        }

        // Verify system_program is System program
        if !cmp_pubkeys(system_program.key, &system_program::ID) {
            return Err(BglLegitError::InvalidSystemProgram.into());
        }

        // Verify staker_token_account is owned by SPL Token program
        assert_owned_by(
            staker_token_account,
            &spl_token::ID,
            BglLegitError::InvalidTokenMint,
        )?;

        // Verify staker type is valid (0 or 1)
        if args.staker_type > 1 {
            return Err(BglLegitError::InvalidStakerType.into());
        }

        Ok(stake_bump)
    }
}

pub fn create_stake<'a>(accounts: &'a [AccountInfo<'a>], instruction_data: &[u8]) -> ProgramResult {
    let ctx = CreateStakeV1Accounts::context(accounts);
    let mut args_data = instruction_data.to_vec();
    let args: &CreateStakeV1Args = from_bytes_mut(&mut args_data);

    let stake_bump = ctx.accounts.check(args)?;

    // Get current time
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;

    // Read pool state to get lockup period
    let pool_data = ctx.accounts.pool.try_borrow_data()?;
    let pool: &StakingPool = from_bytes(&pool_data);

    // Get staker type as enum
    let staker_type = if args.staker_type == 0 {
        crate::state::StakerType::MachineOwner
    } else {
        crate::state::StakerType::GameCreator
    };

    let lockup_period = pool.get_lockup_period(staker_type);
    let lockup_end_time = current_time
        .checked_add(lockup_period)
        .ok_or(BglLegitError::ArithmeticOverflow)?;

    drop(pool_data);

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/

    // Create the stake account with proper PDA derivation
    create_or_allocate_account_raw(
        crate::ID,
        ctx.accounts.stake_account,
        ctx.accounts.system_program,
        ctx.accounts.payer,
        core::mem::size_of::<StakeAccount>(),
        &[
            STAKE_PREFIX,
            ctx.accounts.pool.key.as_ref(),
            ctx.accounts.staker.key.as_ref(),
            &[stake_bump],
        ],
    )?;

    // Transfer tokens from staker's token account to vault
    invoke(
        &transfer(
            &spl_token::ID,
            ctx.accounts.staker_token_account.key,
            ctx.accounts.vault.key,
            ctx.accounts.staker.key,
            &[],
            args.amount,
        )?,
        &[
            ctx.accounts.staker_token_account.clone(),
            ctx.accounts.vault.clone(),
            ctx.accounts.staker.clone(),
            ctx.accounts.token_program.clone(),
        ],
    )?;

    // Update pool's total_staked
    let mut pool_data = ctx.accounts.pool.try_borrow_mut_data()?;
    let pool_mut: &mut StakingPool = from_bytes_mut(&mut pool_data);
    pool_mut.total_staked = pool_mut
        .total_staked
        .checked_add(args.amount)
        .ok_or(BglLegitError::ArithmeticOverflow)?;
    drop(pool_data);

    // Initialize the StakeAccount state
    let mut stake_data = ctx.accounts.stake_account.try_borrow_mut_data()?;
    let stake_account: &mut StakeAccount = from_bytes_mut(&mut stake_data);

    *stake_account = StakeAccount {
        pool: *ctx.accounts.pool.key,
        owner: *ctx.accounts.staker.key,
        staker_type: args.staker_type,
        amount_staked: args.amount,
        stake_start_time: current_time,
        lockup_end_time,
        last_reward_time: current_time,
        total_rewards_claimed: 0,
        _padding: [0; 7],
    };

    Ok(())
}
