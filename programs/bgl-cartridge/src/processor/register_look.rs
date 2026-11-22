use borsh::{BorshDeserialize, BorshSerialize};
use mpl_core::{
    instructions::{
        CreateCollectionV2Cpi, CreateCollectionV2InstructionArgs,
        WriteCollectionExternalPluginAdapterDataV1Cpi,
        WriteCollectionExternalPluginAdapterDataV1InstructionArgs,
    },
    types::{
        Creator, ExternalPluginAdapterInitInfo, ExternalPluginAdapterKey, LinkedAppDataInitInfo,
        MasterEdition, PermanentBurnDelegate, PermanentTransferDelegate, Plugin, PluginAuthority,
        PluginAuthorityPair, Royalties, RuleSet,
    },
};
use mpl_utils::{assert_derivation, assert_signer, cmp_pubkeys};
use shank::ShankType;
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError, pubkey,
    pubkey::Pubkey,
};
use solana_system_interface::program as system_program;

use crate::{
    error::BglCartridgeError,
    instruction::accounts::RegisterLookV1Accounts,
    state::{
        is_look_id, look_pda, read_game_data, validate_payment, LookData, PriceType, GAME_PREFIX,
        LOOK_PREFIX,
    },
};

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Eq, Debug, Clone, ShankType)]
pub struct RegisterLookV1Args {
    /// `[a-z0-9-]{1,32}`, unique per game and creator. A seed of the look PDA.
    pub look_id: String,
    /// Look collection name, 1-32 bytes.
    pub name: String,
    /// Look collection metadata URI, 1-200 bytes.
    pub uri: String,
    /// Name of the game, used to verify the game PDA.
    pub game_name: String,
    /// Nonce of the game PDA.
    pub game_nonce: u8,
    pub price_type: PriceType,
    /// Price in base units of the payment mint.
    pub price: u64,
    /// CRUMBS_MINT or USDC_MINT.
    pub payment_mint_choice: Pubkey,
    /// Hash of the look pack contents.
    pub content_hash: [u8; 32],
    /// Look pack schema version.
    pub schema: u8,
    /// Must be 0 until revenue sharing is supported.
    pub publisher_bps: u16,
    /// Must be 0 until revenue sharing is supported.
    pub protocol_bps: u16,
}

impl RegisterLookV1Args {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        // Skip the discriminator. Borsh rejects out-of-range price types and
        // trailing bytes.
        Self::try_from_slice(input.get(1..).ok_or(ProgramError::InvalidInstructionData)?)
            .map_err(|_| ProgramError::InvalidInstructionData)
    }

    pub fn check(&self) -> ProgramResult {
        if !is_look_id(&self.look_id) {
            return Err(BglCartridgeError::InvalidLookId.into());
        }
        if self.name.is_empty() || self.name.len() > 32 {
            return Err(BglCartridgeError::InvalidName.into());
        }
        if self.uri.is_empty() || self.uri.len() > 200 {
            return Err(BglCartridgeError::InvalidUri.into());
        }
        if self.publisher_bps != 0 || self.protocol_bps != 0 {
            return Err(BglCartridgeError::RevenueShareNotSupported.into());
        }
        validate_payment(&self.payment_mint_choice, self.price_type)?;
        Ok(())
    }
}

impl RegisterLookV1Accounts<'_> {
    /// Returns the look PDA bump.
    pub fn check(&self, args: &RegisterLookV1Args) -> Result<u8, ProgramError> {
        let Self {
            look,
            game,
            creator,
            payer,
            payment_mint,
            mpl_core_program,
            system_program,
        } = self;

        // Payment Mint — must be the mint the look is priced in.
        if !cmp_pubkeys(payment_mint.key, &args.payment_mint_choice) {
            return Err(BglCartridgeError::InvalidPaymentMint.into());
        }

        // Game — must be a real game collection of this program.
        assert_derivation(
            &crate::ID,
            game,
            &[GAME_PREFIX, args.game_name.as_bytes(), &[args.game_nonce]],
            BglCartridgeError::InvalidGamePdaDerivation,
        )?;
        read_game_data(game)?;

        // Look
        let (expected, bump) = look_pda(game.key, creator.key, &args.look_id);
        if !cmp_pubkeys(look.key, &expected) {
            return Err(BglCartridgeError::InvalidLookPdaDerivation.into());
        }

        // Creator
        assert_signer(creator).map_err(|_| BglCartridgeError::AuthorityMustSign)?;

        // Payer
        assert_signer(payer).map_err(|_| BglCartridgeError::PayerMustSign)?;

        // MPL Core Program
        if !cmp_pubkeys(mpl_core_program.key, &mpl_core::ID) {
            return Err(BglCartridgeError::InvalidMplCoreProgram.into());
        }

        // System Program
        if !cmp_pubkeys(system_program.key, &system_program::ID) {
            return Err(BglCartridgeError::InvalidSystemProgram.into());
        }

        Ok(bump)
    }
}

/// The GX royalty key: takes 10% of every look's royalties.
const GX_ROYALTY_KEY: Pubkey = pubkey!("GmbntHsucposYsgj7TE4GeMCjJAU39YcRcSZgPr6jMh7");

/// Royalty creators for a look: 90% to the creator and 10% to GX. Core rejects
/// a duplicate creator address (`InvalidPluginSetting`), so a look GX itself
/// creates gets one 100% entry.
fn look_royalty_creators(creator: &Pubkey) -> Vec<Creator> {
    if cmp_pubkeys(creator, &GX_ROYALTY_KEY) {
        return vec![Creator {
            address: GX_ROYALTY_KEY,
            percentage: 100,
        }];
    }
    vec![
        Creator {
            address: *creator,
            percentage: 90,
        },
        Creator {
            address: GX_ROYALTY_KEY,
            percentage: 10,
        },
    ]
}

/// Register a look: a Core collection at `["look", game, creator, look_id]` whose
/// LinkedAppData holds the look's `LookData`.
pub fn register_look<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = RegisterLookV1Accounts::context(accounts)?;

    let args = RegisterLookV1Args::unpack(args)?;
    args.check()?;
    let bump = ctx.accounts.check(&args)?;

    let game_key = *ctx.accounts.game.key;
    let creator_key = *ctx.accounts.creator.key;
    let signer_seeds: &[&[u8]] = &[
        LOOK_PREFIX,
        game_key.as_ref(),
        creator_key.as_ref(),
        args.look_id.as_bytes(),
        &[bump],
    ];

    // Create the look collection.
    CreateCollectionV2Cpi {
        __program: ctx.accounts.mpl_core_program,
        collection: ctx.accounts.look,
        update_authority: Some(ctx.accounts.look),
        payer: ctx.accounts.payer,
        system_program: ctx.accounts.system_program,
        __args: CreateCollectionV2InstructionArgs {
            name: args.name,
            uri: args.uri,
            plugins: Some(vec![
                PluginAuthorityPair {
                    plugin: Plugin::MasterEdition(MasterEdition {
                        max_supply: None,
                        name: None,
                        uri: None,
                    }),
                    authority: None,
                },
                PluginAuthorityPair {
                    plugin: Plugin::Royalties(Royalties {
                        basis_points: 500, // 5%
                        creators: look_royalty_creators(&creator_key),
                        rule_set: RuleSet::None,
                    }),
                    authority: None,
                },
                // Permanent delegates for institutional AML compliance.
                PluginAuthorityPair {
                    plugin: Plugin::PermanentTransferDelegate(PermanentTransferDelegate {}),
                    authority: Some(PluginAuthority::UpdateAuthority),
                },
                PluginAuthorityPair {
                    plugin: Plugin::PermanentBurnDelegate(PermanentBurnDelegate {}),
                    authority: Some(PluginAuthority::UpdateAuthority),
                },
            ]),
            external_plugin_adapters: Some(vec![ExternalPluginAdapterInitInfo::LinkedAppData(
                LinkedAppDataInitInfo {
                    data_authority: PluginAuthority::UpdateAuthority,
                    init_plugin_authority: None,
                    schema: None,
                },
            )]),
        },
    }
    .invoke_signed(&[signer_seeds])?;

    // Write the look data to the collection.
    let data = LookData {
        version: 1,
        game: game_key,
        creator: creator_key,
        price_type: args.price_type as u8,
        price: args.price,
        payment_mint: args.payment_mint_choice,
        content_hash: args.content_hash,
        look_version: 1,
        schema: args.schema,
        publisher_bps: 0,
        protocol_bps: 0,
    };
    WriteCollectionExternalPluginAdapterDataV1Cpi {
        __program: ctx.accounts.mpl_core_program,
        collection: ctx.accounts.look,
        payer: ctx.accounts.payer,
        authority: Some(ctx.accounts.look),
        buffer: None,
        system_program: ctx.accounts.system_program,
        log_wrapper: None,
        __args: WriteCollectionExternalPluginAdapterDataV1InstructionArgs {
            key: ExternalPluginAdapterKey::LinkedAppData(PluginAuthority::UpdateAuthority),
            data: Some(borsh::to_vec(&data)?),
        },
    }
    .invoke_signed(&[signer_seeds])?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn royalties_split_90_10_for_another_creator() {
        let creator = Pubkey::new_unique();
        let creators = look_royalty_creators(&creator);
        assert_eq!(creators.len(), 2);
        assert_eq!(creators[0].address, creator);
        assert_eq!(creators[0].percentage, 90);
        assert_eq!(creators[1].address, GX_ROYALTY_KEY);
        assert_eq!(creators[1].percentage, 10);
    }

    #[test]
    fn royalties_merge_to_one_entry_when_gx_creates() {
        let creators = look_royalty_creators(&GX_ROYALTY_KEY);
        assert_eq!(creators.len(), 1);
        assert_eq!(creators[0].address, GX_ROYALTY_KEY);
        assert_eq!(creators[0].percentage, 100);
    }
}
