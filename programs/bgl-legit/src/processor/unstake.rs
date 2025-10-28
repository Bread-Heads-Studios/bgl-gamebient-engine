use bytemuck::{from_bytes_mut, Pod, Zeroable};
use shank::{ShankAccounts, ShankType};
use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, sysvar::Sysvar,
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
    pub fn check(&self, _args: &UnstakeV1Args) -> ProgramResult {
        // TODO: Implement full account validation
        // - Verify pool is initialized
        // - Verify stake_account belongs to staker
        // - Verify staker is signer
        // - Verify lockup period has passed
        // - Verify amount <= staked amount
        // - Verify token accounts are valid
        // - Verify vault_authority PDA derivation

        Ok(())
    }
}

pub fn unstake<'a>(accounts: &'a [AccountInfo<'a>], instruction_data: &[u8]) -> ProgramResult {
    let ctx = UnstakeV1Accounts::context(accounts);
    let mut args_data = instruction_data.to_vec();
    let args: &UnstakeV1Args = from_bytes_mut(&mut args_data);

    ctx.accounts.check(args)?;

    // Get current time
    let clock = Clock::get()?;
    let _current_time = clock.unix_timestamp;

    // TODO: Read stake_account state
    // TODO: Check if stake is still locked using stake.is_locked(current_time)
    // TODO: If locked, return StakeStillLocked error
    // TODO: Determine actual amount to unstake (all if args.amount == 0)

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/

    // TODO: Transfer tokens from vault back to staker's token account
    // TODO: Update stake_account's amount_staked
    // TODO: Update pool's total_staked
    // TODO: If amount_staked becomes 0, close the stake account

    Ok(())
}
