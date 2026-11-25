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

use super::machine::load_machine;
use crate::{
    error::BglCartridgeError,
    instruction::accounts::InsertCartridgeV2Accounts,
    state::{read_cartridge_link, GAME_PREFIX},
};

/// Arguments of the retired `InsertCartridgeV1`. Kept so the instruction stays
/// in the IDL at its discriminator; the program rejects it.
#[repr(C)]
#[derive(Pod, Zeroable, PartialEq, Eq, Debug, Copy, Clone, ShankType)]
pub struct InsertCartridgeV1Args {
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
pub struct InsertCartridgeV2Args {
    /// The nonce of the game collection PDA
    pub collection_nonce: u8,
    /// The bump of the game collection PDA
    pub collection_bump: u8,
}

impl InsertCartridgeV2Args {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        // Skip the discriminator. Borsh rejects trailing bytes.
        Self::try_from_slice(input.get(1..).ok_or(ProgramError::InvalidInstructionData)?)
            .map_err(|_| ProgramError::InvalidInstructionData)
    }
}

impl InsertCartridgeV2Accounts<'_> {
    /// Every guard runs here, before any CPI.
    pub fn check(&self) -> ProgramResult {
        // Owner — signs, and must own both the cartridge and the machine.
        assert_signer(self.owner).map_err(|_| BglCartridgeError::CartridgeOwnerMustSign)?;

        // Cartridge — a Core asset owned by the signer whose link slot is
        // empty. No mpl-core CPI here re-verifies ownership, so we do.
        let link = read_cartridge_link(self.cartridge)?;
        let cartridge = BaseAssetV1::from_bytes(self.cartridge.try_borrow_data()?.as_ref())?;
        if !cmp_pubkeys(&cartridge.owner, self.owner.key) {
            return Err(BglCartridgeError::NotCartridgeOwner.into());
        }
        if link.is_some() {
            return Err(BglCartridgeError::CartridgeAlreadyInserted.into());
        }

        // Game Collection
        // SAFE: Checked by Core during the write CPI; the game PDA signs it.

        // Machine & Machine Collection — a Core asset at the machine PDA,
        // owned by the same signer.
        let (machine, _) = load_machine(self.machine, self.machine_collection)?;
        if !cmp_pubkeys(&machine.owner, self.owner.key) {
            return Err(BglCartridgeError::NotMachineOwner.into());
        }

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

/// Inserts a cartridge into a machine: writes the machine's address into the
/// cartridge's link slot. The machine itself is not written, so a machine
/// holds any number of cartridges while a cartridge sits in one machine.
pub fn insert_cartridge_v2<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = InsertCartridgeV2Accounts::context(accounts)?;

    let args = InsertCartridgeV2Args::unpack(args)?;
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
            data: Some(ctx.accounts.machine.key.to_bytes().into()),
        },
    }
    .invoke_signed(&[&[
        GAME_PREFIX,
        collection.name.as_bytes(),
        &[args.collection_nonce],
        &[args.collection_bump],
    ]])
}
