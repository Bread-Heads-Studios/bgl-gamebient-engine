use bytemuck::{from_bytes, from_bytes_mut, Pod, Zeroable};
use mpl_utils::{assert_derivation, assert_owned_by, assert_signer, cmp_pubkeys};
use shank::{ShankAccounts, ShankType};
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program::invoke_signed,
    program_error::ProgramError,
};
use spl_token::instruction::transfer;

use crate::{
    error::BglLegitError,
    state::{StakeAccount, StakingPool, POOL_PREFIX},
};

#[repr(C)]
#[derive(PartialEq, Eq, Debug, Clone, ShankType, Pod, Zeroable, Copy)]
pub struct SlashV1Args {
    #[skip]
    /// The discriminator for the instruction
    discriminator: u8,

    /// Padding for 8-byte alignment
    _padding: [u8; 7],

    /// Amount to slash from the stake
    pub amount: u64,
}

#[derive(ShankAccounts)]
pub struct SlashV1Accounts<'a> {
    #[account(writable, desc = "The staking pool account")]
    pool: &'a AccountInfo<'a>,

    #[account(writable, desc = "The stake account to slash")]
    stake_account: &'a AccountInfo<'a>,

    #[account(signer, desc = "The authority of the pool")]
    authority: &'a AccountInfo<'a>,

    #[account(writable, desc = "The pool's vault token account")]
    vault: &'a AccountInfo<'a>,

    #[account(writable, desc = "The destination for slashed tokens")]
    slash_destination: &'a AccountInfo<'a>,

    #[account(desc = "The vault authority PDA")]
    vault_authority: &'a AccountInfo<'a>,

    #[account(desc = "The SPL Token program")]
    token_program: &'a AccountInfo<'a>,
}

impl SlashV1Accounts<'_> {
    pub fn check(&self, args: &SlashV1Args) -> Result<u8, ProgramError> {
        let Self {
            pool,
            stake_account,
            authority,
            vault: _,
            slash_destination,
            vault_authority,
            token_program,
        } = self;

        // Verify pool is owned by this program
        assert_owned_by(pool, &crate::ID, BglLegitError::InvalidPoolAccount)?;

        // Verify pool has correct size
        if pool.data_len() != core::mem::size_of::<StakingPool>() {
            return Err(BglLegitError::InvalidPoolAccount.into());
        }

        // Read pool state to verify authority
        let pool_data = pool.try_borrow_data()?;
        let pool_state: &StakingPool = from_bytes(&pool_data);

        // Verify authority is signer
        assert_signer(authority).map_err(|_| BglLegitError::AuthorityMustSign)?;

        // Verify authority matches pool.authority
        if !cmp_pubkeys(authority.key, &pool_state.authority) {
            return Err(BglLegitError::InvalidAuthority.into());
        }

        // Verify vault_authority PDA derivation
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

        // Verify stake_account is owned by this program
        assert_owned_by(
            stake_account,
            &crate::ID,
            BglLegitError::InvalidStakeAccount,
        )?;

        // Read stake account to verify amount
        let stake_data = stake_account.try_borrow_data()?;
        let stake: &StakeAccount = from_bytes(&stake_data);

        // Verify amount <= stake amount
        if args.amount > stake.amount_staked {
            return Err(BglLegitError::InsufficientStakeAmount.into());
        }

        drop(stake_data);

        // Verify slash_destination is owned by SPL Token program
        assert_owned_by(
            slash_destination,
            &spl_token::ID,
            BglLegitError::InvalidTokenMint,
        )?;

        // Verify token_program is SPL Token program
        if !cmp_pubkeys(token_program.key, &spl_token::ID) {
            return Err(BglLegitError::InvalidSplTokenProgram.into());
        }

        Ok(authority_bump)
    }
}

pub fn slash<'a>(accounts: &'a [AccountInfo<'a>], instruction_data: &[u8]) -> ProgramResult {
    let ctx = SlashV1Accounts::context(accounts);
    let mut args_data = instruction_data.to_vec();
    let args: &SlashV1Args = from_bytes_mut(&mut args_data);

    let authority_bump = ctx.accounts.check(args)?;

    // Read pool state to get authority and mint for PDA seeds
    let pool_data = ctx.accounts.pool.try_borrow_data()?;
    let pool: &StakingPool = from_bytes(&pool_data);
    let authority = pool.authority;
    let mint = pool.mint;
    drop(pool_data);

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/

    // Transfer slashed tokens from vault to slash_destination using PDA signer
    invoke_signed(
        &transfer(
            &spl_token::ID,
            ctx.accounts.vault.key,
            ctx.accounts.slash_destination.key,
            ctx.accounts.vault_authority.key,
            &[],
            args.amount,
        )?,
        &[
            ctx.accounts.vault.clone(),
            ctx.accounts.slash_destination.clone(),
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
        .checked_sub(args.amount)
        .ok_or(BglLegitError::ArithmeticOverflow)?;
    drop(stake_data);

    // Update pool's total_staked
    let mut pool_data = ctx.accounts.pool.try_borrow_mut_data()?;
    let pool_mut: &mut StakingPool = from_bytes_mut(&mut pool_data);
    pool_mut.total_staked = pool_mut
        .total_staked
        .checked_sub(args.amount)
        .ok_or(BglLegitError::ArithmeticOverflow)?;

    Ok(())
}
