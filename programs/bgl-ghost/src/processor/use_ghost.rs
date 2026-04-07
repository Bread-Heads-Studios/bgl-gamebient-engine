use mpl_utils::{assert_signer, cmp_pubkeys};
use shank::ShankType;
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError,
    system_program,
};

use crate::error::BglGhostError;

#[repr(C)]
#[derive(PartialEq, Eq, Debug, Clone, ShankType)]
pub struct UseGhostV1Args {
    // TODO: Add fields for using a ghost:
    // - game_session_id: Option<Pubkey> (to track which session used this ghost)
    // - usage_timestamp: i64 (when the ghost was used)
    // - additional metadata about the usage
}

impl UseGhostV1Args {
    pub fn check(&self) -> ProgramResult {
        // TODO: Add validation for usage args
        // - Verify game_session_id if required
        // - Verify usage_timestamp is valid
        Ok(())
    }
}

impl UseGhostV1Args {
    pub fn unpack(_input: &[u8]) -> Result<Self, ProgramError> {
        // Skip the discriminator
        let _offset = 1;

        // TODO: Deserialize usage-specific fields

        Ok(Self {})
    }
}

pub struct UseGhostV1Accounts<'a> {
    pub ghost: &'a AccountInfo<'a>,
    pub ghost_owner: &'a AccountInfo<'a>,
    pub player: &'a AccountInfo<'a>,
    pub mpl_core_program: &'a AccountInfo<'a>,
    pub system_program: &'a AccountInfo<'a>,
}

impl<'a> UseGhostV1Accounts<'a> {
    pub fn context(accounts: &'a [AccountInfo<'a>]) -> super::Context<Self> {
        super::Context {
            accounts: Self {
                ghost: &accounts[0],
                ghost_owner: &accounts[1],
                player: &accounts[2],
                mpl_core_program: &accounts[3],
                system_program: &accounts[4],
            },
        }
    }
}

impl UseGhostV1Accounts<'_> {
    pub fn check(&self, _args: &UseGhostV1Args) -> ProgramResult {
        // Ghost
        // TODO: Verify ghost is valid and not expired
        // - Check expiry_timestamp from ghost data
        // - Verify ghost belongs to the correct game

        // Ghost Owner
        // SAFE: Validated by Core

        // Player
        assert_signer(self.player).map_err(|_| BglGhostError::PlayerMustSign)?;

        // MPL Core Program
        if !cmp_pubkeys(self.mpl_core_program.key, &mpl_core::ID) {
            return Err(BglGhostError::InvalidMplCoreProgram.into());
        }

        // System Program
        if !cmp_pubkeys(self.system_program.key, &system_program::ID) {
            return Err(BglGhostError::InvalidSystemProgram.into());
        }

        // TODO: Add validation for additional accounts

        Ok(())
    }
}

pub fn use_ghost<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = UseGhostV1Accounts::context(accounts);

    let args = UseGhostV1Args::unpack(args)?;
    args.check()?;
    ctx.accounts.check(&args)?;

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/

    // TODO: Implement ghost usage logic:
    // 1. Verify ghost is not expired (check expiry_timestamp)
    // 2. Read ghost data (score, replay_data, etc.) from AppData plugin
    // 3. If payout is enabled:
    //    - Transfer payout_amount from player to ghost_owner
    //    - Validate player has sufficient funds
    // 4. Record usage (update usage counter, track game session, etc.)
    // 5. Optionally update ghost data (usage count, last_used_timestamp, etc.)

    // Placeholder for payout logic
    // if payout_enabled {
    //     // Transfer SOL from player to ghost_owner
    //     // Use system_program::transfer or similar
    // }

    Ok(())
}
