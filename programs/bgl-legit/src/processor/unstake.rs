use bytemuck::{from_bytes, from_bytes_mut, Pod, Zeroable};
use mpl_utils::{assert_derivation, assert_owned_by, assert_signer, cmp_pubkeys};
use shank::{ShankAccounts, ShankType};
use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, program::invoke_signed,
    program_error::ProgramError, sysvar::Sysvar,
};
use spl_token::instruction::transfer;

use crate::{
    error::BglLegitError,
    state::{StakeAccount, StakingPool, POOL_PREFIX},
};

#[repr(C)]
#[derive(PartialEq, Eq, Debug, Clone, ShankType, Pod, Zeroable, Copy)]
pub struct UnstakeV1Args {
    #[skip]
    /// The discriminator for the instruction
    discriminator: u8,

    /// Padding for 8-byte alignment
    _padding: [u8; 7],

    /// Amount to unstake (0 means unstake all)
    pub amount: u64,
}

#[derive(ShankAccounts)]
pub struct UnstakeV1Accounts<'a> {
    #[account(writable, desc = "The staking pool account")]
    pool: &'a AccountInfo<'a>,

    #[account(writable, desc = "The stake account")]
    stake_account: &'a AccountInfo<'a>,

    #[account(signer, desc = "The staker")]
    staker: &'a AccountInfo<'a>,

    #[account(writable, desc = "The staker's token account")]
    staker_token_account: &'a AccountInfo<'a>,

    #[account(writable, desc = "The pool's vault token account")]
    vault: &'a AccountInfo<'a>,

    #[account(desc = "The vault authority PDA")]
    vault_authority: &'a AccountInfo<'a>,

    #[account(desc = "The SPL Token program")]
    token_program: &'a AccountInfo<'a>,
}

impl UnstakeV1Accounts<'_> {
    pub fn check(&self, args: &UnstakeV1Args, current_time: i64) -> Result<u8, ProgramError> {
        let Self {
            pool,
            stake_account,
            staker,
            staker_token_account: _,
            vault: _,
            vault_authority,
            token_program,
        } = self;

        // Verify pool is owned by this program
        assert_owned_by(pool, &crate::ID, BglLegitError::InvalidPoolAccount)?;

        // Verify stake_account is owned by this program
        assert_owned_by(
            stake_account,
            &crate::ID,
            BglLegitError::InvalidStakeAccount,
        )?;

        // Read stake account to verify ownership and lockup
        let stake_data = stake_account.try_borrow_data()?;
        let stake: &StakeAccount = from_bytes(&stake_data);

        // Verify staker is signer
        assert_signer(staker).map_err(|_| BglLegitError::StakerMustSign)?;

        // Verify stake_account belongs to staker
        if !cmp_pubkeys(&stake.owner, staker.key) {
            return Err(BglLegitError::InvalidAuthority.into());
        }

        // Verify stake_account belongs to this pool
        if !cmp_pubkeys(&stake.pool, pool.key) {
            return Err(BglLegitError::InvalidPoolAccount.into());
        }

        // Verify lockup period has passed
        if stake.is_locked(current_time) {
            return Err(BglLegitError::StakeStillLocked.into());
        }

        // Verify amount <= staked amount (0 means unstake all)
        if args.amount > stake.amount_staked {
            return Err(BglLegitError::InsufficientStakeAmount.into());
        }

        drop(stake_data);

        // Verify vault_authority PDA derivation
        let pool_data = pool.try_borrow_data()?;
        let pool_state: &StakingPool = from_bytes(&pool_data);
        let authority_bump = assert_derivation(
            &crate::ID,
            vault_authority,
            &[
                POOL_PREFIX,
                pool_state.authority.as_ref(),
                pool_state.mint.as_ref(),
            ],
            BglLegitError::InvalidPoolPdaDerivation,
        )?;
        drop(pool_data);

        // Verify token_program is SPL Token program
        if !cmp_pubkeys(token_program.key, &spl_token::ID) {
            return Err(BglLegitError::InvalidSplTokenProgram.into());
        }

        Ok(authority_bump)
    }
}

pub fn unstake<'a>(accounts: &'a [AccountInfo<'a>], instruction_data: &[u8]) -> ProgramResult {
    let ctx = UnstakeV1Accounts::context(accounts);
    let mut args_data = instruction_data.to_vec();
    let args: &UnstakeV1Args = from_bytes_mut(&mut args_data);

    // Get current time
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;

    let authority_bump = ctx.accounts.check(args, current_time)?;

    // Read stake_account state to determine amount to unstake
    let stake_data = ctx.accounts.stake_account.try_borrow_data()?;
    let stake: &StakeAccount = from_bytes(&stake_data);
    let unstake_amount = if args.amount == 0 {
        stake.amount_staked // Unstake all
    } else {
        args.amount
    };
    drop(stake_data);

    // Read pool state to get authority and mint for PDA seeds
    let pool_data = ctx.accounts.pool.try_borrow_data()?;
    let pool: &StakingPool = from_bytes(&pool_data);
    let authority = pool.authority;
    let mint = pool.mint;
    drop(pool_data);

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/

    // Transfer tokens from vault back to staker's token account using PDA signer
    invoke_signed(
        &transfer(
            &spl_token::ID,
            ctx.accounts.vault.key,
            ctx.accounts.staker_token_account.key,
            ctx.accounts.vault_authority.key,
            &[],
            unstake_amount,
        )?,
        &[
            ctx.accounts.vault.clone(),
            ctx.accounts.staker_token_account.clone(),
            ctx.accounts.vault_authority.clone(),
            ctx.accounts.token_program.clone(),
        ],
        &[&[
            POOL_PREFIX,
            authority.as_ref(),
            mint.as_ref(),
            &[authority_bump],
        ]],
    )?;

    // Update stake_account's amount_staked
    let mut stake_data = ctx.accounts.stake_account.try_borrow_mut_data()?;
    let stake_mut: &mut StakeAccount = from_bytes_mut(&mut stake_data);
    stake_mut.amount_staked = stake_mut
        .amount_staked
        .checked_sub(unstake_amount)
        .ok_or(BglLegitError::ArithmeticOverflow)?;
    drop(stake_data);

    // Update pool's total_staked
    let mut pool_data = ctx.accounts.pool.try_borrow_mut_data()?;
    let pool_mut: &mut StakingPool = from_bytes_mut(&mut pool_data);
    pool_mut.total_staked = pool_mut
        .total_staked
        .checked_sub(unstake_amount)
        .ok_or(BglLegitError::ArithmeticOverflow)?;

    Ok(())
}
