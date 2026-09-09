use borsh::BorshDeserialize;
use bytemuck::{from_bytes, Pod, Zeroable};
use mpl_core::{
    accounts::BaseCollectionV1,
    errors::MplCoreError,
    fetch_collection_plugin, fetch_external_plugin_adapter_data_info,
    instructions::{AddCollectionPluginV1Cpi, AddCollectionPluginV1InstructionArgs},
    types::{
        ExternalPluginAdapterKey, LinkedDataKey, Plugin, PluginAuthority, PluginType,
        UpdateDelegate,
    },
};
use mpl_utils::{assert_derivation, assert_owned_by, assert_signer, cmp_pubkeys};
use shank::ShankType;
use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult};
use solana_system_interface::program as system_program;

use crate::{
    error::BglCartridgeError,
    instruction::accounts::OptInLibraryV1Accounts,
    state::{GameCollectionData, GAME_PREFIX, LIBRARY_PREFIX},
};

#[repr(C)]
#[derive(Pod, Zeroable, PartialEq, Eq, Debug, Copy, Clone, ShankType)]
pub struct OptInLibraryV1Args {
    #[skip]
    /// The discriminator for the instruction
    discriminator: u8,
    /// The nonce for the game collection
    collection_nonce: u8,
    /// The bump for the game collection
    collection_bump: u8,
}

impl OptInLibraryV1Accounts<'_> {
    pub fn check(&self) -> ProgramResult {
        let Self {
            game,
            library,
            curator,
            publisher,
            payer,
            mpl_core_program,
            system_program,
        } = self;

        // Game
        assert_owned_by(
            game,
            &mpl_core::ID,
            BglCartridgeError::InvalidMplCoreProgram,
        )?;

        // Library
        // The delegate must be a PDA of this program, never an arbitrary key.
        assert_derivation(
            &crate::ID,
            library,
            &[LIBRARY_PREFIX, curator.key.as_ref()],
            BglCartridgeError::InvalidLibraryPdaDerivation,
        )?;

        // Curator
        // SAFE: Only used as a seed; does not need to sign.

        // Publisher
        assert_signer(publisher).map_err(|_| BglCartridgeError::PublisherMustSign)?;

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

        Ok(())
    }
}

/// Reads the publisher recorded on the game collection's LinkedAppData.
pub(crate) fn read_game_collection_data(
    game: &AccountInfo,
) -> Result<GameCollectionData, solana_program::program_error::ProgramError> {
    let (offset, length) = fetch_external_plugin_adapter_data_info::<BaseCollectionV1>(
        game,
        None,
        &ExternalPluginAdapterKey::DataSection(LinkedDataKey::LinkedAppData(
            PluginAuthority::UpdateAuthority,
        )),
    )?;

    Ok(GameCollectionData::try_from_slice(
        game.try_borrow_data()?[offset..offset + length].as_ref(),
    )?)
}

/// Returns the collection's UpdateDelegate plugin, or `None` when it has none.
pub(crate) fn fetch_update_delegate(
    game: &AccountInfo,
) -> Result<Option<UpdateDelegate>, solana_program::program_error::ProgramError> {
    match fetch_collection_plugin::<UpdateDelegate>(game, PluginType::UpdateDelegate) {
        Ok((_, plugin, _)) => Ok(Some(plugin)),
        Err(e) if e.to_string() == MplCoreError::PluginNotFound.to_string() => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn opt_in_library<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = OptInLibraryV1Accounts::context(accounts)?;

    ctx.accounts.check()?;

    let args: &OptInLibraryV1Args = from_bytes(args);

    // Read the collection so we can construct PDA seeds for signing.
    let collection = BaseCollectionV1::from_bytes(ctx.accounts.game.try_borrow_data()?.as_ref())?;

    // Only the publisher recorded at release time may opt the game in.
    let game_data = read_game_collection_data(ctx.accounts.game)?;
    if !cmp_pubkeys(ctx.accounts.publisher.key, &game_data.publisher) {
        return Err(BglCartridgeError::InvalidPublisher.into());
    }

    // One library per game in v1.
    if fetch_update_delegate(ctx.accounts.game)?.is_some() {
        return Err(BglCartridgeError::LibraryDelegateAlreadySet.into());
    }

    // Grant the library authority PDA delegate rights, signing as the game
    // collection PDA (its update authority). The plugin authority stays
    // UpdateAuthority so only this program can change or remove it.
    AddCollectionPluginV1Cpi {
        __program: ctx.accounts.mpl_core_program,
        collection: ctx.accounts.game,
        payer: ctx.accounts.payer,
        authority: Some(ctx.accounts.game),
        system_program: ctx.accounts.system_program,
        log_wrapper: None,
        __args: AddCollectionPluginV1InstructionArgs {
            plugin: Plugin::UpdateDelegate(UpdateDelegate {
                additional_delegates: vec![*ctx.accounts.library.key],
            }),
            init_authority: None,
        },
    }
    .invoke_signed(&[&[
        GAME_PREFIX,
        collection.name.as_bytes(),
        &[args.collection_nonce],
        &[args.collection_bump],
    ]])?;

    Ok(())
}
