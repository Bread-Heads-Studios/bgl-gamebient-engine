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
    account_info::AccountInfo, entrypoint::ProgramResult, program::invoke,
    program_error::ProgramError, pubkey, pubkey::Pubkey,
};
use solana_system_interface::program as system_program;
use spl_associated_token_account::instruction::create_associated_token_account_idempotent;

use crate::{
    error::BglCartridgeError,
    instruction::accounts::ReleaseGameV1Accounts,
    state::{validate_payment, GameCollectionData, PriceType, CRUMBS_MINT, GAME_PREFIX},
};

#[repr(C)]
#[derive(PartialEq, Eq, Debug, Clone, ShankType)]
pub struct ReleaseGameV1Args {
    name: String,
    uri: String,
    nonce: u8,
    price_type: PriceType,
    price: u64,
    /// CRUMBS_MINT or USDC_MINT. None (or absent, for older clients) means CRUMBS.
    payment_mint_choice: Option<Pubkey>,
}

impl ReleaseGameV1Args {
    fn payment_mint(&self) -> Pubkey {
        self.payment_mint_choice.unwrap_or(CRUMBS_MINT)
    }
}

impl ReleaseGameV1Args {
    pub fn check(&self) -> ProgramResult {
        // Name
        // We don't allow empty names and we limit the length to 32 characters
        // so it can be used as a PDA seed.
        if self.name.is_empty() || self.name.len() > 32 {
            return Err(BglCartridgeError::InvalidName.into());
        }

        // URI
        if self.uri.is_empty() {
            return Err(BglCartridgeError::InvalidUri.into());
        }

        validate_payment(&self.payment_mint(), self.price_type)?;

        Ok(())
    }
}

impl ReleaseGameV1Args {
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
        offset += uri_len;

        // Read nonce
        let nonce = input[offset];
        offset += 1;

        // Read price type
        let price_type = PriceType::from(input[offset]);
        offset += 1;

        // Read price
        let price = u64::from_le_bytes(
            input[offset..offset + 8]
                .try_into()
                .map_err(|_| ProgramError::InvalidInstructionData)?,
        );
        offset += 8;

        // Optional payment mint (Borsh Option<Pubkey>). Older clients stop
        // after the price, which reads as None.
        let payment_mint_choice = match input.get(offset) {
            None | Some(0) => None,
            Some(1) => Some(Pubkey::new_from_array(
                input
                    .get(offset + 1..offset + 33)
                    .ok_or(ProgramError::InvalidInstructionData)?
                    .try_into()
                    .map_err(|_| ProgramError::InvalidInstructionData)?,
            )),
            Some(_) => return Err(ProgramError::InvalidInstructionData),
        };

        Ok(Self {
            name,
            uri,
            nonce,
            price_type,
            price,
            payment_mint_choice,
        })
    }
}

impl ReleaseGameV1Accounts<'_> {
    pub fn check(&self, args: &ReleaseGameV1Args) -> Result<u8, ProgramError> {
        let Self {
            game,
            game_token_account: _game_token_account,
            payer,
            authority,
            payment_mint,
            mpl_core_program,
            token_program,
            associated_token_program,
            system_program,
        } = self;
        // Game
        let bump = assert_derivation(
            &crate::ID,
            game,
            &[GAME_PREFIX, args.name.as_bytes(), &[args.nonce]],
            BglCartridgeError::InvalidGamePdaDerivation,
        )?;

        // Game Token Account
        // SAFE: Checked by CreateAssociatedTokenAccountIdempotent

        // Payer
        assert_signer(payer).map_err(|_| BglCartridgeError::PayerMustSign)?;

        // Authority
        if let Some(authority) = authority {
            assert_signer(authority).map_err(|_| BglCartridgeError::AuthorityMustSign)?;
        }

        // Payment Mint — must be the mint the game is priced in.
        if !cmp_pubkeys(payment_mint.key, &args.payment_mint()) {
            return Err(BglCartridgeError::InvalidPaymentMint.into());
        }

        // MPL Core Program
        if !cmp_pubkeys(mpl_core_program.key, &mpl_core::ID) {
            return Err(BglCartridgeError::InvalidMplCoreProgram.into());
        }

        // Token Program
        if !cmp_pubkeys(token_program.key, &spl_token::ID) {
            return Err(BglCartridgeError::InvalidTokenProgram.into());
        }

        // Associated Token Program
        if !cmp_pubkeys(
            associated_token_program.key,
            &spl_associated_token_account::ID,
        ) {
            return Err(BglCartridgeError::InvalidAssociatedTokenProgram.into());
        }

        // System Program
        if !cmp_pubkeys(system_program.key, &system_program::ID) {
            return Err(BglCartridgeError::InvalidSystemProgram.into());
        }

        Ok(bump)
    }
}

pub fn release_game<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = ReleaseGameV1Accounts::context(accounts)?;

    let args = ReleaseGameV1Args::unpack(args)?;
    args.check()?;
    let bump = ctx.accounts.check(&args)?;

    /*****************************************************/
    /****************** Argument Guards ******************/
    /*****************************************************/
    if args.name.is_empty() {
        return Err(BglCartridgeError::InvalidName.into());
    }

    if args.uri.is_empty() {
        return Err(BglCartridgeError::InvalidUri.into());
    }

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/
    let payment_mint = args.payment_mint();

    // Create the Game
    CreateCollectionV2Cpi {
        __program: ctx.accounts.mpl_core_program,
        collection: ctx.accounts.game,
        update_authority: Some(ctx.accounts.game),
        payer: ctx.accounts.payer,
        system_program: ctx.accounts.system_program,
        __args: CreateCollectionV2InstructionArgs {
            name: args.name.clone(),
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
                        creators: vec![
                            Creator {
                                address: *ctx.accounts.authority.unwrap_or(ctx.accounts.payer).key,
                                percentage: 90,
                            },
                            Creator {
                                address: pubkey!("GmbntHsucposYsgj7TE4GeMCjJAU39YcRcSZgPr6jMh7"),
                                percentage: 10,
                            },
                        ],
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
    .invoke_signed(&[&[GAME_PREFIX, args.name.as_bytes(), &[args.nonce], &[bump]]])?;

    // Write basic Game data to the collection.
    let data = GameCollectionData {
        version: 1,
        price_type: args.price_type as u8,
        price: args.price,
        publisher: *ctx.accounts.authority.unwrap_or(ctx.accounts.payer).key,
        payment_mint,
    };
    WriteCollectionExternalPluginAdapterDataV1Cpi {
        __program: ctx.accounts.mpl_core_program,
        collection: ctx.accounts.game,
        payer: ctx.accounts.payer,
        authority: Some(ctx.accounts.game),
        buffer: None,
        system_program: ctx.accounts.system_program,
        log_wrapper: None,
        __args: WriteCollectionExternalPluginAdapterDataV1InstructionArgs {
            key: ExternalPluginAdapterKey::LinkedAppData(PluginAuthority::UpdateAuthority),
            data: Some(borsh::to_vec(&data)?),
        },
    }
    .invoke_signed(&[&[GAME_PREFIX, args.name.as_bytes(), &[args.nonce], &[bump]]])?;

    // CRUMBS games collect Transfer payments in a token account owned by the
    // game. USDC games pay the publisher directly, so they need none.
    if cmp_pubkeys(&payment_mint, &CRUMBS_MINT) {
        invoke(
            &create_associated_token_account_idempotent(
                ctx.accounts.payer.key,
                ctx.accounts.game.key,
                &CRUMBS_MINT,
                ctx.accounts.token_program.key,
            ),
            &[
                ctx.accounts.payer.clone(),
                ctx.accounts.game.clone(),
                ctx.accounts.game_token_account.clone(),
                ctx.accounts.payment_mint.clone(),
                ctx.accounts.token_program.clone(),
                ctx.accounts.system_program.clone(),
            ],
        )?;
    }

    Ok(())
}
