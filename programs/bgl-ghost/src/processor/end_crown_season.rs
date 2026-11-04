use mpl_utils::{assert_signer, cmp_pubkeys};
use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, sysvar::Sysvar,
};

use crate::{
    error::BglGhostError,
    instruction::accounts::EndCrownSeasonV1Accounts,
    processor::crown_utils::{
        accrue, assert_token_program, load_crown, save_crown, transfer_from_vault, vault_balance,
    },
    state::Crown,
};

impl EndCrownSeasonV1Accounts<'_> {
    pub fn check(&self, state: &Crown) -> ProgramResult {
        // Crown
        // SAFE: Loaded and validated by `load_crown`.
        if state.is_active == 0 {
            return Err(BglGhostError::CrownInactive.into());
        }

        // Authority
        assert_signer(self.authority).map_err(|_| BglGhostError::AuthorityMustSign)?;
        if !cmp_pubkeys(self.authority.key, &state.authority) {
            return Err(BglGhostError::InvalidAuthority.into());
        }

        // Vault, Pot
        // SAFE: Validated before the transfers.

        // Destination
        // SAFE: Mint is checked by the token program during the transfer.

        // Token Program
        assert_token_program(self.token_program)
    }
}

/// Ends the season: pays the final accrual into the pot, returns what's left in
/// the vault to `destination` and stops further claims. The final holder keeps
/// the crown (and its pot) as a trophy.
pub fn end_crown_season<'a>(accounts: &'a [AccountInfo<'a>], _args: &[u8]) -> ProgramResult {
    let ctx = EndCrownSeasonV1Accounts::context(accounts)?;

    let mut state = load_crown(ctx.accounts.crown)?;
    ctx.accounts.check(&state)?;

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

    let remaining = vault_balance(ctx.accounts.vault, ctx.accounts.crown.key, &state)?;
    transfer_from_vault(
        ctx.accounts.token_program,
        ctx.accounts.vault,
        ctx.accounts.destination,
        ctx.accounts.crown,
        &state,
        remaining,
    )?;

    state.is_active = 0;
    save_crown(ctx.accounts.crown, &state)
}
