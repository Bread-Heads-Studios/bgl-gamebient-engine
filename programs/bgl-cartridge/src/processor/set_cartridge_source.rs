use borsh::BorshDeserialize;
use bytemuck::{from_bytes, Pod, Zeroable};
use mpl_core::{
    accounts::BaseCollectionV1,
    fetch_external_plugin_adapter_data_info,
    instructions::{
        WriteExternalPluginAdapterDataV1Cpi, WriteExternalPluginAdapterDataV1InstructionArgs,
    },
    types::{ExternalPluginAdapterKey, PluginAuthority},
};
use mpl_utils::{assert_signer, cmp_pubkeys};
use shank::ShankType;
use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, system_program,
    sysvar::Sysvar,
};

use crate::{
    error::BglCartridgeError,
    instruction::accounts::SetCartridgeSourceV1Accounts,
    state::{CartridgeData, Source, GAME_PREFIX, LOCALNET_AUTHORITY, SOURCE_AUTHORITY},
};

#[repr(C)]
#[derive(Pod, Zeroable, PartialEq, Eq, Debug, Copy, Clone, ShankType)]
pub struct SetCartridgeSourceV1Args {
    #[skip]
    /// The discriminator for the instruction
    discriminator: u8,
    /// The nonce for the game collection
    collection_nonce: u8,
    /// The bump for the game collection
    collection_bump: u8,
    /// The source to record (Crypto or Stripe). Unknown is rejected.
    #[idl_type(Source)]
    source: u8,
}

impl SetCartridgeSourceV1Accounts<'_> {
    pub fn check(&self) -> ProgramResult {
        let Self {
            cartridge: _cartridge,
            game: _game,
            authority,
            payer,
            mpl_core_program,
            system_program,
        } = self;

        // Cartridge & Game
        // SAFE: Identity/ownership checked by Core during the write CPI;
        //       collection membership enforced because seeds derive from
        //       the game PDA the authority signs as.

        // Authority — must be the configured Source authority and must sign.
        // If it's epoch zero, then we can assume it's a localnet for testing.
        assert_signer(authority).map_err(|_| BglCartridgeError::AuthorityMustSign)?;
        if !cmp_pubkeys(authority.key, &SOURCE_AUTHORITY)
            && (Clock::get()?.epoch != 0 || !cmp_pubkeys(authority.key, &LOCALNET_AUTHORITY))
        {
            return Err(BglCartridgeError::InvalidSourceAuthority.into());
        }

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

pub fn set_cartridge_source<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = SetCartridgeSourceV1Accounts::context(accounts)?;
    solana_program::msg!("Setting cartridge source");

    ctx.accounts.check()?;
    solana_program::msg!("Account checks passed");

    let args: &SetCartridgeSourceV1Args = from_bytes(args);

    // Validate the requested source. Unknown is reserved as the default;
    // out-of-range values are rejected.
    if args.source == Source::Unknown as u8 || args.source > Source::Stripe as u8 {
        return Err(BglCartridgeError::InvalidSource.into());
    }

    // Read the collection so we can construct PDA seeds for signing the write.
    let collection = BaseCollectionV1::from_bytes(ctx.accounts.game.try_borrow_data()?.as_ref())?;

    // Read the existing AppData on the cartridge. Write-once: if the source
    // is anything other than Unknown, refuse.
    let (offset, length) =
        fetch_external_plugin_adapter_data_info::<mpl_core::accounts::BaseAssetV1>(
            ctx.accounts.cartridge,
            None,
            &ExternalPluginAdapterKey::AppData(PluginAuthority::UpdateAuthority),
        )?;
    let existing = CartridgeData::try_from_slice(
        ctx.accounts.cartridge.try_borrow_data()?[offset..offset + length].as_ref(),
    )?;
    if existing.source != Source::Unknown as u8 {
        return Err(BglCartridgeError::SourceAlreadySet.into());
    }

    // Write the new source value, signing as the game collection PDA (which
    // is the AppData's data authority via UpdateAuthority).
    let new_data = CartridgeData {
        version: existing.version,
        source: args.source,
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
            data: Some(borsh::to_vec(&new_data)?),
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
