use borsh::{BorshDeserialize, BorshSerialize};
use bytemuck::{Pod, Zeroable};
use mpl_core::{
    accounts::{BaseAssetV1, BaseCollectionV1},
    instructions::{
        WriteExternalPluginAdapterDataV1Cpi, WriteExternalPluginAdapterDataV1InstructionArgs,
    },
    types::{ExternalPluginAdapterKey, PluginAuthority},
};
use mpl_utils::{assert_signer, cmp_pubkeys};
use shank::ShankType;
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError,
};
use solana_system_interface::program as system_program;

use crate::{
    error::BglCartridgeError,
    instruction::accounts::RemoveCartridgeV2Accounts,
    state::{read_cartridge_link, GAME_PREFIX},
};

/// Arguments of the retired `RemoveCartridgeV1`. Kept so the instruction stays
/// in the IDL at its discriminator; the program rejects it.
#[repr(C)]
#[derive(Pod, Zeroable, PartialEq, Eq, Debug, Copy, Clone, ShankType)]
pub struct RemoveCartridgeV1Args {
    #[skip]
    /// The discriminator for the instruction
    discriminator: u8,
    /// The nonce for the collection
    collection_nonce: u8,
    /// The bump for the collection
    collection_bump: u8,
}

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Eq, Debug, Clone, ShankType)]
pub struct RemoveCartridgeV2Args {
    /// The nonce of the game collection PDA
    pub collection_nonce: u8,
    /// The bump of the game collection PDA
    pub collection_bump: u8,
}

impl RemoveCartridgeV2Args {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        // Skip the discriminator. Borsh rejects trailing bytes.
        Self::try_from_slice(input.get(1..).ok_or(ProgramError::InvalidInstructionData)?)
            .map_err(|_| ProgramError::InvalidInstructionData)
    }
}

impl RemoveCartridgeV2Accounts<'_> {
    /// Every guard runs here, before any CPI.
    pub fn check(&self) -> ProgramResult {
        // Cartridge Owner
        assert_signer(self.cartridge_owner)
            .map_err(|_| BglCartridgeError::CartridgeOwnerMustSign)?;

        // Cartridge — a Core asset owned by the signer whose link slot holds
        // a machine. No mpl-core CPI here re-verifies ownership, so we do.
        let link = read_cartridge_link(self.cartridge)?;
        let cartridge = BaseAssetV1::from_bytes(self.cartridge.try_borrow_data()?.as_ref())?;
        if !cmp_pubkeys(&cartridge.owner, self.cartridge_owner.key) {
            return Err(BglCartridgeError::NotCartridgeOwner.into());
        }
        if link.is_none() {
            return Err(BglCartridgeError::CartridgeNotInserted.into());
        }

        // Game Collection
        // SAFE: Checked by Core during the write CPI; the game PDA signs it.

        // Payer
        assert_signer(self.payer).map_err(|_| BglCartridgeError::PayerMustSign)?;

        // MPL Core Program
        if !cmp_pubkeys(self.mpl_core_program.key, &mpl_core::ID) {
            return Err(BglCartridgeError::InvalidMplCoreProgram.into());
        }

        // System Program
        if !cmp_pubkeys(self.system_program.key, &system_program::ID) {
            return Err(BglCartridgeError::InvalidSystemProgram.into());
        }

        Ok(())
    }
}

/// Removes a cartridge from whatever machine it is in: clears the cartridge's
/// link slot. The machine is not needed and not written.
pub fn remove_cartridge_v2<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = RemoveCartridgeV2Accounts::context(accounts)?;

    let args = RemoveCartridgeV2Args::unpack(args)?;
    ctx.accounts.check()?;

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/
    // Sign as the game collection PDA, the data authority of the cartridge's
    // LinkedAppData.
    let collection = BaseCollectionV1::from_bytes(ctx.accounts.game.try_borrow_data()?.as_ref())?;
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
            key: ExternalPluginAdapterKey::LinkedAppData(PluginAuthority::UpdateAuthority),
            data: Some(vec![]),
        },
    }
    .invoke_signed(&[&[
        GAME_PREFIX,
        collection.name.as_bytes(),
        &[args.collection_nonce],
        &[args.collection_bump],
    ]])
}
