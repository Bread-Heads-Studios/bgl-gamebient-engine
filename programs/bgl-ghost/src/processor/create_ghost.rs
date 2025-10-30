use mpl_core::instructions::{CreateV2Cpi, CreateV2InstructionArgs};
use mpl_core::types::{
    AppDataInitInfo, DataState, ExternalPluginAdapterInitInfo, ExternalPluginAdapterSchema,
    PluginAuthority,
};
use mpl_utils::{assert_derivation, assert_signer, cmp_pubkeys};
use shank::{ShankAccounts, ShankType};
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError,
    system_program,
};

use crate::{error::BglGhostError, state::GHOST_PREFIX};

#[repr(C)]
#[derive(PartialEq, Eq, Debug, Clone, ShankType)]
pub struct CreateGhostV1Args {
    pub name: String,
    pub uri: String,
    // TODO: Add fields for ghost data:
    // - game_id: Pubkey (which game this ghost belongs to)
    // - score: u64 (high score)
    // - replay_data: Vec<u8> (encoded play data)
    // - expiry_timestamp: Option<i64> (when this ghost expires)
    // - payout_enabled: bool (whether payouts are enabled)
    // - payout_amount: Option<u64> (how much to pay per use)
}

impl CreateGhostV1Args {
    pub fn check(&self) -> ProgramResult {
        // Name
        // We don't allow empty names and we limit the length to 32 characters
        // so it can be used as a PDA seed.
        if self.name.is_empty() || self.name.len() > 32 {
            return Err(BglGhostError::InvalidName.into());
        }

        // URI
        if self.uri.is_empty() {
            return Err(BglGhostError::InvalidUri.into());
        }

        // TODO: Add validation for ghost-specific fields:
        // - Validate game_id is valid
        // - Validate score is reasonable
        // - Validate replay_data size limits
        // - Validate expiry_timestamp is in the future (if set)
        // - Validate payout_amount is reasonable (if set)

        Ok(())
    }
}

impl CreateGhostV1Args {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        // Skip the discriminator
        let mut offset = 1;

        // Read name length (4 bytes, little-endian like Borsh)
        let name_len = u32::from_le_bytes(
            input[offset..offset + 4]
                .try_into()
                .map_err(|_| ProgramError::InvalidInstructionData)?,
        ) as usize;
        offset += 4;

        // Read name bytes
        let name = String::from_utf8(input[offset..offset + name_len].to_vec())
            .map_err(|_| ProgramError::InvalidInstructionData)?;
        offset += name_len;

        // Read URI length
        let uri_len = u32::from_le_bytes(
            input[offset..offset + 4]
                .try_into()
                .map_err(|_| ProgramError::InvalidInstructionData)?,
        ) as usize;
        offset += 4;

        // Read URI bytes
        let uri = String::from_utf8(input[offset..offset + uri_len].to_vec())
            .map_err(|_| ProgramError::InvalidInstructionData)?;

        // TODO: Deserialize additional ghost-specific fields here

        Ok(Self { name, uri })
    }
}

#[derive(ShankAccounts)]
pub struct CreateGhostV1Accounts<'a> {
    #[account(writable, desc = "The new ghost asset account")]
    ghost: &'a AccountInfo<'a>,

    #[account(writable, desc = "The Core ghost collection (if using collections)")]
    ghost_collection: &'a AccountInfo<'a>,

    #[account(desc = "The owner of the ghost (player who created the high score)")]
    owner: &'a AccountInfo<'a>,

    #[account(writable, signer, desc = "The account paying for the storage fees")]
    payer: &'a AccountInfo<'a>,

    #[account(optional, signer, desc = "The authority signing for account creation")]
    authority: Option<&'a AccountInfo<'a>>,

    #[account(desc = "The mpl core program")]
    mpl_core_program: &'a AccountInfo<'a>,

    #[account(desc = "The system program")]
    system_program: &'a AccountInfo<'a>,
    // TODO: Add additional accounts as needed:
    // - game_account: &'a AccountInfo<'a> (to verify the game exists)
    // - payout_config: Option<&'a AccountInfo<'a>> (for payout settings)
}

impl CreateGhostV1Accounts<'_> {
    pub fn check(&self, args: &CreateGhostV1Args) -> Result<u8, ProgramError> {
        // Ghost PDA derivation
        // TODO: Determine proper PDA seeds - maybe [GHOST_PREFIX, game_id, owner, name]?
        let bump = assert_derivation(
            &crate::ID,
            self.ghost,
            &[GHOST_PREFIX, args.name.as_bytes()],
            BglGhostError::InvalidGhostPdaDerivation,
        )?;

        // Ghost Collection (optional)
        // SAFE: Checked by Core if provided

        // Owner
        // SAFE: No need to check

        // Payer
        assert_signer(self.payer).map_err(|_| BglGhostError::PayerMustSign)?;

        // Authority
        if let Some(authority) = self.authority {
            assert_signer(authority).map_err(|_| BglGhostError::AuthorityMustSign)?;
        }

        // MPL Core Program
        if !cmp_pubkeys(self.mpl_core_program.key, &mpl_core::ID) {
            return Err(BglGhostError::InvalidMplCoreProgram.into());
        }

        // System Program
        if !cmp_pubkeys(self.system_program.key, &system_program::ID) {
            return Err(BglGhostError::InvalidSystemProgram.into());
        }

        // TODO: Add validation for additional accounts (game_account, etc.)

        Ok(bump)
    }
}

pub fn create_ghost<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = CreateGhostV1Accounts::context(accounts);

    let args = CreateGhostV1Args::unpack(args)?;
    args.check()?;
    let bump = ctx.accounts.check(&args)?;

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/
    // Create the Ghost NFT
    // TODO: Determine what plugins to add:
    // - FreezeDelegate? (to prevent transfers during gameplay)
    // - Burn? (to allow expiration)
    // - Transfer? (to allow ghost trading)
    // - Update? (to update high scores?)

    CreateV2Cpi {
        __program: ctx.accounts.mpl_core_program,
        asset: ctx.accounts.ghost,
        collection: Some(ctx.accounts.ghost_collection),
        owner: Some(ctx.accounts.owner),
        authority: ctx.accounts.authority,
        update_authority: None,
        payer: ctx.accounts.payer,
        system_program: ctx.accounts.system_program,
        log_wrapper: None,
        __args: CreateV2InstructionArgs {
            name: args.name.clone(),
            uri: args.uri,
            data_state: DataState::AccountState,
            plugins: Some(vec![
                // TODO: Add appropriate plugins based on ghost requirements
                // Note: Burn plugin may not exist in current mpl-core version
                // Consider using FreezeDelegate or other available plugins
            ]),
            external_plugin_adapters: Some(vec![ExternalPluginAdapterInitInfo::AppData(
                AppDataInitInfo {
                    data_authority: PluginAuthority::Address {
                        address: *ctx.accounts.ghost.key,
                    },
                    init_plugin_authority: None,
                    schema: Some(ExternalPluginAdapterSchema::Binary),
                },
            )]),
        },
    }
    .invoke_signed(&[&[GHOST_PREFIX, args.name.as_bytes(), &[bump]]])?;

    // TODO: Store additional ghost data in AppData plugin
    // This might include: score, replay_data, expiry_timestamp, etc.

    Ok(())
}
