use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, sysvar::Sysvar,
};

use crate::{
    error::BglGhostError,
    instruction::accounts::AccrueCrownV1Accounts,
    processor::crown_utils::{accrue, assert_token_program, load_crown, save_crown},
};

impl AccrueCrownV1Accounts<'_> {
    pub fn check(&self) -> ProgramResult {
        // Crown
        // SAFE: Loaded and validated by `load_crown`.

        // Vault, Pot
        // SAFE: Validated before the transfer.

        // Token Program
        assert_token_program(self.token_program)
    }
}

/// Permissionless: pays the time-held reward owed so far into the pot.
pub fn accrue_crown<'a>(accounts: &'a [AccountInfo<'a>], _args: &[u8]) -> ProgramResult {
    let ctx = AccrueCrownV1Accounts::context(accounts)?;

    let mut state = load_crown(ctx.accounts.crown)?;
    ctx.accounts.check()?;
    if state.is_active == 0 {
        return Err(BglGhostError::CrownInactive.into());
    }

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/
    accrue(
        ctx.accounts.token_program,
        ctx.accounts.vault,
        ctx.accounts.pot,
        ctx.accounts.crown,
        &mut state,
        Clock::get()?.unix_timestamp,
    )?;

    save_crown(ctx.accounts.crown, &state)
}
