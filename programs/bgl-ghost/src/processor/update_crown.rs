use borsh::BorshDeserialize;
use mpl_utils::{assert_signer, cmp_pubkeys};
use shank::ShankType;
use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult,
    program_error::ProgramError, pubkey::Pubkey, sysvar::Sysvar,
};

use crate::{
    error::BglGhostError,
    instruction::accounts::UpdateCrownV1Accounts,
    processor::crown_utils::{accrue, assert_token_program, load_crown, save_crown},
    state::{Crown, CrownConfig},
};

#[repr(C)]
#[derive(PartialEq, Eq, Debug, Clone, ShankType, BorshDeserialize)]
pub struct UpdateCrownV1Args {
    /// The backend key that co-signs score submissions.
    pub attestor: Pubkey,
    pub config: CrownConfig,
}

impl UpdateCrownV1Args {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        // Skip the discriminator
        Self::try_from_slice(&input[1..]).map_err(|_| ProgramError::InvalidInstructionData)
    }
}

impl UpdateCrownV1Accounts<'_> {
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
        // SAFE: Validated before the transfer.

        // Token Program
        assert_token_program(self.token_program)
    }
}

/// Rotates the attestor and/or changes the reward settings. Accrual owed under
/// the old settings is paid out first.
pub fn update_crown<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = UpdateCrownV1Accounts::context(accounts)?;

    let args = UpdateCrownV1Args::unpack(args)?;
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

    state.attestor = args.attestor;
    state.config = args.config;
    save_crown(ctx.accounts.crown, &state)
}
