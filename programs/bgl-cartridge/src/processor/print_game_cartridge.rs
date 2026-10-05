use bytemuck::{from_bytes, Pod, Zeroable};
use mpl_core::{
    accounts::BaseCollectionV1,
    fetch_external_plugin_adapter_data_info,
    instructions::{
        CreateV2Cpi, CreateV2InstructionArgs, WriteExternalPluginAdapterDataV1Cpi,
        WriteExternalPluginAdapterDataV1InstructionArgs,
    },
    types::{
        AppDataInitInfo, DataState, Edition, ExternalPluginAdapterInitInfo,
        ExternalPluginAdapterKey, LinkedDataKey, PermanentFreezeDelegate, Plugin, PluginAuthority,
        PluginAuthorityPair,
    },
};
use mpl_utils::{assert_owned_by, assert_signer, cmp_pubkeys};
use shank::ShankType;
use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, program::invoke,
    program_error::ProgramError, program_pack::Pack, pubkey::Pubkey, sysvar::Sysvar,
};
use solana_system_interface::program as system_program;
use spl_token::state::Account as SplTokenAccount;

use crate::{
    error::BglCartridgeError,
    instruction::accounts::PrintGameCartridgeV1Accounts,
    state::{
        is_usdc_mint, CartridgeData, Currency, GameCollectionDataV1, PriceType, Source,
        GAME_PREFIX, PAYMENT_TOKEN_MINT,
    },
};

#[repr(C)]
#[derive(Pod, Zeroable, PartialEq, Eq, Debug, Copy, Clone, ShankType)]
pub struct PrintGameCartridgeV1Args {
    #[skip]
    /// The discriminator for the instruction
    discriminator: u8,
    /// The nonce for the collection
    collection_nonce: u8,
    /// The bump for the collection
    collection_bump: u8,
    /// The currency to pay in (Crumbs or Usdc). Clients built before USDC
    /// pricing omit this byte, which the program reads as Crumbs.
    #[idl_type(Currency)]
    currency: u8,
}

impl PrintGameCartridgeV1Args {
    /// Length of the instruction data before the currency byte was added.
    const LEGACY_LEN: usize = 3;

    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        if input.len() < Self::LEGACY_LEN || input.len() > std::mem::size_of::<Self>() {
            return Err(ProgramError::InvalidInstructionData);
        }
        let mut bytes = [0u8; std::mem::size_of::<Self>()];
        bytes[..input.len()].copy_from_slice(input);
        Ok(*from_bytes::<Self>(&bytes))
    }
}

impl PrintGameCartridgeV1Accounts<'_> {
    /// `expected_mint` is the mint of the chosen currency; both token
    /// accounts and `payment_mint` must be for it.
    pub fn check(&self, expected_mint: &Pubkey) -> ProgramResult {
        let Self {
            cartridge: _cartridge,
            game,
            game_token_account,
            owner: _owner,
            payer,
            payer_token_account,
            authority,
            payment_mint,
            mpl_core_program,
            token_program,
            system_program,
        } = self;

        // Cartridge
        // SAFE: New mint so it can be anything.

        // Game
        // SAFE: Checked by Core

        // Game Token Account
        assert_owned_by(
            game_token_account,
            &spl_token::ID,
            BglCartridgeError::InvalidGameTokenAccountProgramOwner,
        )?;

        let token_account =
            SplTokenAccount::unpack(game_token_account.try_borrow_data()?.as_ref())?;

        if token_account.owner != *game.key {
            return Err(BglCartridgeError::InvalidGameTokenAccountOwner.into());
        }

        if token_account.mint != *expected_mint {
            return Err(BglCartridgeError::InvalidGameTokenAccountMint.into());
        }

        // Owner
        // SAFE: Can be anything.

        // Payer
        assert_signer(payer).map_err(|_| BglCartridgeError::PayerMustSign)?;

        // Payer Token Account
        assert_owned_by(
            payer_token_account,
            &spl_token::ID,
            BglCartridgeError::InvalidPayerTokenAccountProgramOwner,
        )?;

        let token_account =
            SplTokenAccount::unpack(payer_token_account.try_borrow_data()?.as_ref())?;

        if token_account.owner != *payer.key {
            return Err(BglCartridgeError::InvalidPayerTokenAccountOwner.into());
        }

        if token_account.mint != *expected_mint {
            return Err(BglCartridgeError::InvalidPayerTokenAccountMint.into());
        }

        // Authority
        if let Some(authority) = authority {
            assert_signer(authority).map_err(|_| BglCartridgeError::AuthorityMustSign)?;
        }

        // Payment Mint
        if !cmp_pubkeys(payment_mint.key, expected_mint) {
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

        // System Program
        if !cmp_pubkeys(system_program.key, &system_program::ID) {
            return Err(BglCartridgeError::InvalidSystemProgram.into());
        }

        Ok(())
    }
}

pub fn print_game_cartridge<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = PrintGameCartridgeV1Accounts::context(accounts)?;
    solana_program::msg!("Printing game cartridge");

    let args = PrintGameCartridgeV1Args::unpack(args)?;
    let currency = Currency::try_from(args.currency)?;
    solana_program::msg!("Args parsed");

    // The payment mint decides which token accounts are valid. For USDC the
    // caller's `payment_mint` must be the accepted USDC mint; for the payment
    // token it must be PAYMENT_TOKEN_MINT.
    let expected_mint = match currency {
        Currency::Crumbs => PAYMENT_TOKEN_MINT,
        Currency::Usdc => {
            if !is_usdc_mint(ctx.accounts.payment_mint.key, Clock::get()?.epoch) {
                return Err(BglCartridgeError::InvalidUsdcMint.into());
            }
            *ctx.accounts.payment_mint.key
        }
    };

    // All account guards and validations happen here.
    ctx.accounts.check(&expected_mint)?;
    solana_program::msg!("Account checks passed");

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/
    // Fetch the collection data so we can derive the PDA signer
    let collection = BaseCollectionV1::from_bytes(ctx.accounts.game.try_borrow_data()?.as_ref())?;
    solana_program::msg!("Collection fetched");

    // Handle payment for the game.
    // Fetch the game data.
    let (offset, length) = fetch_external_plugin_adapter_data_info::<BaseCollectionV1>(
        ctx.accounts.game,
        None,
        &ExternalPluginAdapterKey::DataSection(LinkedDataKey::LinkedAppData(
            PluginAuthority::UpdateAuthority,
        )),
    )?;

    let game_collection_data = GameCollectionDataV1::load(
        ctx.accounts.game.try_borrow_data()?[offset..offset + length].as_ref(),
    )?;

    solana_program::msg!("Game collection data fetched: {:?}", game_collection_data);

    // Take the payment. USDC is always transferred to the game's USDC token
    // account; the payment token is transferred or burned per `price_type`.
    let (amount, price_type) = match currency {
        Currency::Crumbs => (
            game_collection_data.price,
            PriceType::from(game_collection_data.price_type),
        ),
        Currency::Usdc => {
            if !game_collection_data.accepts_usdc() {
                return Err(BglCartridgeError::UsdcNotAccepted.into());
            }
            (game_collection_data.usdc_price, PriceType::Transfer)
        }
    };
    match price_type {
        PriceType::Transfer => invoke(
            &spl_token::instruction::transfer(
                ctx.accounts.token_program.key,
                ctx.accounts.payer_token_account.key,
                ctx.accounts.game_token_account.key,
                ctx.accounts.payer.key,
                &[],
                amount,
            )?,
            &[
                ctx.accounts.payer_token_account.clone(),
                ctx.accounts.game_token_account.clone(),
                ctx.accounts.payer.clone(),
            ],
        ),
        PriceType::Burn => invoke(
            &spl_token::instruction::burn(
                ctx.accounts.token_program.key,
                ctx.accounts.payer_token_account.key,
                ctx.accounts.payment_mint.key,
                ctx.accounts.payer.key,
                &[],
                amount,
            )?,
            &[
                ctx.accounts.payer_token_account.clone(),
                ctx.accounts.payment_mint.clone(),
                ctx.accounts.payer.clone(),
            ],
        ),
    }?;

    // Create the Game Cartridge
    // We need to fetch the count to use as the edition number
    let name = format!("{} {}", collection.name, collection.num_minted + 1);
    solana_program::msg!("Name formatted");
    CreateV2Cpi {
        __program: ctx.accounts.mpl_core_program,
        asset: ctx.accounts.cartridge,
        collection: Some(ctx.accounts.game),
        owner: Some(ctx.accounts.owner),
        authority: Some(ctx.accounts.game),
        update_authority: None,
        payer: ctx.accounts.payer,
        system_program: ctx.accounts.system_program,
        log_wrapper: None,
        __args: CreateV2InstructionArgs {
            name,
            uri: collection.uri,
            data_state: DataState::AccountState,
            plugins: Some(vec![
                PluginAuthorityPair {
                    plugin: Plugin::Edition(Edition {
                        number: collection.num_minted + 1,
                    }),
                    authority: None,
                },
                PluginAuthorityPair {
                    plugin: Plugin::PermanentFreezeDelegate(PermanentFreezeDelegate {
                        frozen: true,
                    }),
                    authority: Some(PluginAuthority::UpdateAuthority),
                },
            ]),
            external_plugin_adapters: Some(vec![ExternalPluginAdapterInitInfo::AppData(
                AppDataInitInfo {
                    data_authority: PluginAuthority::UpdateAuthority,
                    init_plugin_authority: Some(PluginAuthority::UpdateAuthority),
                    schema: None,
                },
            )]),
        },
    }
    .invoke_signed(&[&[
        GAME_PREFIX,
        collection.name.as_bytes(),
        &[args.collection_nonce],
        &[args.collection_bump],
    ]])?;
    solana_program::msg!("Game cartridge printed");

    // Initialize the AppData with source = Unknown. Only the AML authority
    // can later upgrade this via set_cartridge_source.
    let cartridge_data = CartridgeData {
        version: 0,
        source: Source::Unknown as u8,
    };
    WriteExternalPluginAdapterDataV1Cpi {
        __program: ctx.accounts.mpl_core_program,
        asset: ctx.accounts.cartridge,
        collection: Some(ctx.accounts.game),
        payer: ctx.accounts.payer,
        authority: Some(ctx.accounts.game),
        buffer: None,
        system_program: ctx.accounts.system_program,
        log_wrapper: None,
        __args: WriteExternalPluginAdapterDataV1InstructionArgs {
            key: ExternalPluginAdapterKey::AppData(PluginAuthority::UpdateAuthority),
            data: Some(borsh::to_vec(&cartridge_data)?),
        },
    }
    .invoke_signed(&[&[
        GAME_PREFIX,
        collection.name.as_bytes(),
        &[args.collection_nonce],
        &[args.collection_bump],
    ]])?;
    solana_program::msg!("Cartridge source recorded");

    Ok(())
}
