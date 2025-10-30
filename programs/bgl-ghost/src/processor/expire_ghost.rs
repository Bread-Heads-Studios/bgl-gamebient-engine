use mpl_core::instructions::{BurnV1Cpi, BurnV1InstructionArgs};
use mpl_utils::{assert_signer, cmp_pubkeys};
use shank::{ShankAccounts, ShankType};
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError,
    system_program,
};

use crate::error::BglGhostError;

#[repr(C)]
#[derive(PartialEq, Eq, Debug, Clone, ShankType)]
pub struct ExpireGhostV1Args {
    // TODO: Add fields for expiring a ghost:
    // - reason: Option<String> (why the ghost is being expired)
}

impl ExpireGhostV1Args {
    pub fn check(&self) -> ProgramResult {
        // TODO: Add validation for expire args
        Ok(())
    }
}

impl ExpireGhostV1Args {
    pub fn unpack(_input: &[u8]) -> Result<Self, ProgramError> {
        // Skip the discriminator
        let _offset = 1;

        // TODO: Deserialize expire-specific fields

        Ok(Self {})
    }
}

#[derive(ShankAccounts)]
pub struct ExpireGhostV1Accounts<'a> {
    #[account(writable, desc = "The ghost asset to expire/burn")]
    ghost: &'a AccountInfo<'a>,

    #[account(
        optional,
        writable,
        desc = "The ghost collection (if part of a collection)"
    )]
    ghost_collection: Option<&'a AccountInfo<'a>>,

    #[account(writable, signer, desc = "The authority that can expire the ghost")]
    authority: &'a AccountInfo<'a>,

    #[account(desc = "The mpl core program")]
    mpl_core_program: &'a AccountInfo<'a>,

    #[account(desc = "The system program")]
    system_program: &'a AccountInfo<'a>,
    // TODO: Add additional accounts as needed:
    // - payer: Option<&'a AccountInfo<'a>> (to receive rent refund)
}

impl ExpireGhostV1Accounts<'_> {
    pub fn check(&self, _args: &ExpireGhostV1Args) -> ProgramResult {
        // Ghost
        // TODO: Verify ghost is valid and meets expiration criteria
        // - Check if expiry_timestamp has passed
        // - Verify authority has permission to expire (owner, game authority, or program)

        // Authority
        assert_signer(self.authority).map_err(|_| BglGhostError::AuthorityMustSign)?;

        // MPL Core Program
        if !cmp_pubkeys(self.mpl_core_program.key, &mpl_core::ID) {
            return Err(BglGhostError::InvalidMplCoreProgram.into());
        }

        // System Program
        if !cmp_pubkeys(self.system_program.key, &system_program::ID) {
            return Err(BglGhostError::InvalidSystemProgram.into());
        }

        // TODO: Validate authority has permission to expire this ghost
        // Options:
        // 1. Ghost owner can always expire their own ghost
        // 2. Game authority can expire invalid ghosts
        // 3. Program can auto-expire based on timestamp
        // 4. Check expiry_timestamp and validate it has passed

        Ok(())
    }
}

pub fn expire_ghost<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = ExpireGhostV1Accounts::context(accounts);

    let args = ExpireGhostV1Args::unpack(args)?;
    args.check()?;
    ctx.accounts.check(&args)?;

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/

    // TODO: Implement ghost expiration logic:
    // 1. Verify the ghost should be expired:
    //    - Check expiry_timestamp has passed (if set)
    //    - Verify ghost is no longer valid (e.g., game version changed)
    // 2. Optionally record expiration event
    // 3. Burn the ghost NFT using Core's burn instruction

    // Burn the ghost NFT
    // TODO: Verify BurnV1Cpi signature matches mpl-core version
    BurnV1Cpi {
        __program: ctx.accounts.mpl_core_program,
        asset: ctx.accounts.ghost,
        collection: ctx.accounts.ghost_collection,
        authority: Some(ctx.accounts.authority),
        payer: ctx.accounts.authority, // TODO: Determine if payer should be separate
        system_program: Some(ctx.accounts.system_program),
        log_wrapper: None,
        __args: BurnV1InstructionArgs {
            compression_proof: None,
        },
    }
    .invoke()?;

    Ok(())
}
