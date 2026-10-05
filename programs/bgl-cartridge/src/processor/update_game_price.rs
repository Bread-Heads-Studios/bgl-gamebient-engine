use borsh::{BorshDeserialize, BorshSerialize};
use mpl_core::{
    accounts::BaseCollectionV1,
    fetch_external_plugin_adapter_data_info,
    instructions::{
        WriteCollectionExternalPluginAdapterDataV1Cpi,
        WriteCollectionExternalPluginAdapterDataV1InstructionArgs,
    },
    types::{ExternalPluginAdapterKey, LinkedDataKey, PluginAuthority},
};
use mpl_utils::{assert_owned_by, assert_signer, cmp_pubkeys};
use shank::ShankType;
use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, program::invoke,
    program_error::ProgramError, pubkey::Pubkey, sysvar::Sysvar,
};
use solana_system_interface::program as system_program;
use spl_associated_token_account::instruction::create_associated_token_account_idempotent;

use crate::{
    error::BglCartridgeError,
    instruction::accounts::UpdateGamePriceV1Accounts,
    state::{is_usdc_mint, GameCollectionDataV1, PriceType, GAME_PREFIX},
};

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Eq, Debug, Clone, ShankType)]
pub struct UpdateGamePriceV1Args {
    /// The nonce for the game collection
    collection_nonce: u8,
    /// The bump for the game collection
    collection_bump: u8,
    /// The new payment type (Transfer or Burn)
    price_type: PriceType,
    /// The new price, in base units of the payment token
    price: u64,
    /// The new USDC price, in USDC base units (6 decimals). Zero means the
    /// game cannot be bought with USDC.
    usdc_price: u64,
}

impl UpdateGamePriceV1Args {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        // Skip the discriminator. Borsh rejects out-of-range price types and
        // trailing bytes, so a malformed payload never reaches the write.
        Self::try_from_slice(input.get(1..).ok_or(ProgramError::InvalidInstructionData)?)
            .map_err(|_| ProgramError::InvalidInstructionData)
    }
}

impl UpdateGamePriceV1Accounts<'_> {
    pub fn check(&self) -> ProgramResult {
        let Self {
            game,
            game_usdc_token_account: _game_usdc_token_account,
            authority,
            payer,
            usdc_mint,
            mpl_core_program,
            token_program,
            associated_token_program,
            system_program,
        } = self;

        // Game
        // Must be a Core collection. The publisher check below only has
        // meaning if the data we read was written by this program as the
        // collection's update authority, which the PDA check guarantees.
        assert_owned_by(
            game,
            &mpl_core::ID,
            BglCartridgeError::InvalidGamePdaDerivation,
        )?;

        // Authority — must sign; compared with the stored publisher once the
        // game data has been read.
        assert_signer(authority).map_err(|_| BglCartridgeError::AuthorityMustSign)?;

        // Payer
        assert_signer(payer).map_err(|_| BglCartridgeError::PayerMustSign)?;

        // Game USDC Token Account
        // SAFE: Checked by CreateAssociatedTokenAccountIdempotent when a USDC
        //       price is set; unused otherwise.

        // USDC Mint
        if !is_usdc_mint(usdc_mint.key, Clock::get()?.epoch) {
            return Err(BglCartridgeError::InvalidUsdcMint.into());
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

        Ok(())
    }
}

/// Update the price and payment type of a game.
///
/// Rewrites the `GameCollectionData` stored in the game collection's
/// LinkedAppData, keeping `version` and `publisher` as they are. Only the
/// publisher recorded at release time may call this. Cartridges printed
/// afterwards pay the new price; already printed ones are unaffected.
pub fn update_game_price<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = UpdateGamePriceV1Accounts::context(accounts)?;
    solana_program::msg!("Updating game price");

    ctx.accounts.check()?;
    solana_program::msg!("Account checks passed");

    let args = UpdateGamePriceV1Args::unpack(args)?;

    // Read the collection so we can verify the PDA and sign the write.
    let collection = BaseCollectionV1::from_bytes(ctx.accounts.game.try_borrow_data()?.as_ref())?;

    let seeds: &[&[u8]] = &[
        GAME_PREFIX,
        collection.name.as_bytes(),
        &[args.collection_nonce],
        &[args.collection_bump],
    ];
    let expected = Pubkey::create_program_address(seeds, &crate::ID)
        .map_err(|_| BglCartridgeError::InvalidGamePdaDerivation)?;
    if !cmp_pubkeys(&expected, ctx.accounts.game.key) {
        return Err(BglCartridgeError::InvalidGamePdaDerivation.into());
    }

    // Read the existing game data.
    let (offset, length) = fetch_external_plugin_adapter_data_info::<BaseCollectionV1>(
        ctx.accounts.game,
        None,
        &ExternalPluginAdapterKey::DataSection(LinkedDataKey::LinkedAppData(
            PluginAuthority::UpdateAuthority,
        )),
    )?;
    let existing = GameCollectionDataV1::load(
        ctx.accounts.game.try_borrow_data()?[offset..offset + length].as_ref(),
    )?;

    // Only the publisher recorded at release time may reprice the game.
    if !cmp_pubkeys(ctx.accounts.authority.key, &existing.publisher) {
        return Err(BglCartridgeError::InvalidPublisher.into());
    }

    // A game that accepts USDC needs somewhere to receive it.
    if args.usdc_price > 0 {
        invoke(
            &create_associated_token_account_idempotent(
                ctx.accounts.payer.key,
                ctx.accounts.game.key,
                ctx.accounts.usdc_mint.key,
                ctx.accounts.token_program.key,
            ),
            &[
                ctx.accounts.payer.clone(),
                ctx.accounts.game.clone(),
                ctx.accounts.game_usdc_token_account.clone(),
                ctx.accounts.usdc_mint.clone(),
                ctx.accounts.token_program.clone(),
                ctx.accounts.system_program.clone(),
            ],
        )?;
    }

    // Write the new prices, signing as the game collection PDA (which is the
    // LinkedAppData's data authority via UpdateAuthority). Always written as
    // version 1, which upgrades version 0 data in place.
    let new_data = GameCollectionDataV1 {
        version: GameCollectionDataV1::VERSION,
        price_type: args.price_type as u8,
        price: args.price,
        publisher: existing.publisher,
        usdc_price: args.usdc_price,
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
            data: Some(borsh::to_vec(&new_data)?),
        },
    }
    .invoke_signed(&[seeds])?;
    solana_program::msg!("Game price updated: {:?}", new_data);

    Ok(())
}
