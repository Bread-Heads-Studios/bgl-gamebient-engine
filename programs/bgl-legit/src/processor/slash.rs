use bytemuck::{from_bytes_mut, Pod, Zeroable};
use shank::{ShankAccounts, ShankType};
use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult};

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
    pub fn check(&self, _args: &SlashV1Args) -> ProgramResult {
        // TODO: Implement full account validation
        // - Verify pool is initialized
        // - Verify authority is signer
        // - Verify authority matches pool.authority
        // - Verify stake_account is valid
        // - Verify amount <= stake amount
        // - Verify vault_authority PDA derivation
        // - Verify slash_destination is valid token account

        Ok(())
    }
}

pub fn slash<'a>(accounts: &'a [AccountInfo<'a>], instruction_data: &[u8]) -> ProgramResult {
    let ctx = SlashV1Accounts::context(accounts);
    let mut args_data = instruction_data.to_vec();
    let args: &SlashV1Args = from_bytes_mut(&mut args_data);

    ctx.accounts.check(args)?;

    // TODO: Read pool state
    // TODO: Read stake_account state
    // TODO: Verify amount is valid
    // TODO: Determine slashing logic and conditions

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/

    // TODO: Transfer slashed tokens from vault to slash_destination
    // TODO: Update stake_account's amount_staked (subtract slashed amount)
    // TODO: Update pool's total_staked (subtract slashed amount)
    // TODO: Consider: Should we emit an event or log the slash?

    Ok(())
}
