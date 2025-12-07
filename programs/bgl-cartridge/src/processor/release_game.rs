use mpl_core::{
    instructions::{
        CreateCollectionV2Cpi, CreateCollectionV2InstructionArgs,
        WriteCollectionExternalPluginAdapterDataV1Cpi,
        WriteCollectionExternalPluginAdapterDataV1InstructionArgs,
    },
    types::{
        Creator, ExternalPluginAdapterInitInfo, ExternalPluginAdapterKey, LinkedAppDataInitInfo,
        MasterEdition, Plugin, PluginAuthority, PluginAuthorityPair, Royalties, RuleSet,
    },
};
use mpl_utils::{assert_derivation, assert_owned_by, assert_signer, cmp_pubkeys};
use shank::{ShankAccounts, ShankType};
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program::invoke,
    program_error::ProgramError, program_pack::Pack, pubkey, system_program,
};
use spl_associated_token_account::instruction::create_associated_token_account_idempotent;
use spl_token::state::Account as SplTokenAccount;

use crate::{
    error::BglCartridgeError,
    state::{GameCollectionData, PriceType, GAME_PREFIX, PAYMENT_TOKEN_MINT},
};

#[repr(C)]
#[derive(PartialEq, Eq, Debug, Clone, ShankType)]
pub struct ReleaseGameV1Args {
    name: String,
    uri: String,
    nonce: u8,
    price_type: PriceType,
    price: u64,
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

        Ok(Self {
            name,
            uri,
            nonce,
            price_type,
            price,
        })
    }
}

#[derive(ShankAccounts)]
pub struct ReleaseGameV1Accounts<'a> {
    #[account(writable, desc = "The new game Collection account")]
    game: &'a AccountInfo<'a>,

    #[account(
        writable,
        desc = "The token account receiving the payment for the game"
    )]
    game_token_account: &'a AccountInfo<'a>,

    #[account(writable, signer, desc = "The account paying for the storage fees")]
    payer: &'a AccountInfo<'a>,

    #[account(optional, signer, desc = "The authority signing for account creation")]
    authority: Option<&'a AccountInfo<'a>>,

    #[account(desc = "The Mint address for the payment token")]
    payment_mint: &'a AccountInfo<'a>,

    #[account(desc = "The mpl core program")]
    mpl_core_program: &'a AccountInfo<'a>,

    #[account(desc = "The token program")]
    token_program: &'a AccountInfo<'a>,

    #[account(desc = "The associated token program")]
    associated_token_program: &'a AccountInfo<'a>,

    #[account(desc = "The system program")]
    system_program: &'a AccountInfo<'a>,
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

        // Payment Mint
        if !cmp_pubkeys(payment_mint.key, &PAYMENT_TOKEN_MINT) {
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
    let ctx = ReleaseGameV1Accounts::context(accounts);

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
        version: 0,
        price_type: args.price_type as u8,
        price: args.price,
        publisher: *ctx.accounts.authority.unwrap_or(ctx.accounts.payer).key,
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

    // Create the game token account
    invoke(
        &create_associated_token_account_idempotent(
            ctx.accounts.payer.key,
            ctx.accounts.game.key,
            &PAYMENT_TOKEN_MINT,
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

    Ok(())
}
