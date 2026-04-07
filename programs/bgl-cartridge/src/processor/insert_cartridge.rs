use bytemuck::{from_bytes, Pod, Zeroable};
use mpl_core::{
    accounts::{BaseAssetV1, BaseCollectionV1},
    fetch_external_plugin_adapter_data_info,
    instructions::{
        AddPluginV1Cpi, AddPluginV1InstructionArgs, WriteExternalPluginAdapterDataV1Cpi,
        WriteExternalPluginAdapterDataV1InstructionArgs,
    },
    types::{ExternalPluginAdapterKey, FreezeDelegate, Plugin, PluginAuthority},
};
use mpl_utils::{assert_derivation, assert_signer, cmp_pubkeys};
use shank::ShankType;
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError,
    system_program,
};

use crate::{
    error::BglCartridgeError,
    state::{GAME_PREFIX, MACHINE_PREFIX},
};

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

pub struct InsertCartridgeV1Accounts<'a> {
    pub cartridge: &'a AccountInfo<'a>,
    pub game: &'a AccountInfo<'a>,
    pub cartridge_owner: &'a AccountInfo<'a>,
    pub machine: &'a AccountInfo<'a>,
    pub machine_collection: &'a AccountInfo<'a>,
    pub machine_owner: &'a AccountInfo<'a>,
    pub mpl_core_program: &'a AccountInfo<'a>,
    pub system_program: &'a AccountInfo<'a>,
}

impl<'a> InsertCartridgeV1Accounts<'a> {
    pub fn context(accounts: &'a [AccountInfo<'a>]) -> super::Context<Self> {
        super::Context {
            accounts: Self {
                cartridge: &accounts[0],
                game: &accounts[1],
                cartridge_owner: &accounts[2],
                machine: &accounts[3],
                machine_collection: &accounts[4],
                machine_owner: &accounts[5],
                mpl_core_program: &accounts[6],
                system_program: &accounts[7],
            },
        }
    }
}

impl InsertCartridgeV1Accounts<'_> {
    pub fn check(&self) -> Result<(u8, String), ProgramError> {
        // Cartridge
        // SAFE: Checked by Core

        // Game Collection
        // SAFE: Checked by Core

        // Cartridge Owner
        assert_signer(self.cartridge_owner)
            .map_err(|_| BglCartridgeError::CartridgeOwnerMustSign)?;

        // Machine
        let machine_name = BaseAssetV1::from_bytes(self.machine.try_borrow_data()?.as_ref())?.name;
        let bump = assert_derivation(
            &crate::ID,
            self.machine,
            &[
                MACHINE_PREFIX,
                self.machine_collection.key.as_ref(),
                machine_name.as_bytes(),
            ],
            BglCartridgeError::InvalidMachinePdaDerivation,
        )?;

        // Check if a cartridge is already inserted into the machine.
        let (_, length) = fetch_external_plugin_adapter_data_info::<BaseAssetV1>(
            self.machine,
            None,
            &ExternalPluginAdapterKey::AppData(PluginAuthority::Address {
                address: *self.machine.key,
            }),
        )?;

        if length > 0 {
            return Err(BglCartridgeError::CartridgeAlreadyInserted.into());
        }

        // Machine Collection
        // SAFE: Checked by Core

        // Machine Owner
        // SAFE: No need to check

        // MPL Core Program
        if !cmp_pubkeys(self.mpl_core_program.key, &mpl_core::ID) {
            return Err(BglCartridgeError::InvalidMplCoreProgram.into());
        }

        // System Program
        if !cmp_pubkeys(self.system_program.key, &system_program::ID) {
            return Err(BglCartridgeError::InvalidSystemProgram.into());
        }

        Ok((bump, machine_name))
    }
}

pub fn insert_cartridge<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = InsertCartridgeV1Accounts::context(accounts);

    // All account guards and validations happen here.
    let (machine_bump, machine_name) = ctx.accounts.check()?;

    let args: &InsertCartridgeV1Args = from_bytes(args);

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/
    // Insert the cartridge, this means
    // 1. Freeze it so it can't be transferred because it's "in"
    //   a machine
    // 2. Add the machine to the Cartridge's AppData
    // 3. Add the cartridge to the Machine's AppData

    // Freeze the cartridge by delegating the freeze authority to the machine and freezing.
    AddPluginV1Cpi {
        __program: ctx.accounts.mpl_core_program,
        asset: ctx.accounts.cartridge,
        collection: Some(ctx.accounts.game),
        payer: ctx.accounts.cartridge_owner,
        authority: None,
        system_program: ctx.accounts.system_program,
        log_wrapper: None,
        __args: AddPluginV1InstructionArgs {
            plugin: Plugin::FreezeDelegate(FreezeDelegate { frozen: true }),
            init_authority: Some(PluginAuthority::Address {
                address: *ctx.accounts.machine.key,
            }),
        },
    }
    .invoke()?;

    // Add the machine to the Cartridge's AppData
    let collection = BaseCollectionV1::from_bytes(ctx.accounts.game.try_borrow_data()?.as_ref())?;
    WriteExternalPluginAdapterDataV1Cpi {
        __program: ctx.accounts.mpl_core_program,
        asset: ctx.accounts.cartridge,
        collection: Some(ctx.accounts.game),
        payer: ctx.accounts.cartridge_owner,
        authority: Some(ctx.accounts.game),
        buffer: None,
        system_program: ctx.accounts.system_program,
        log_wrapper: None,
        __args: WriteExternalPluginAdapterDataV1InstructionArgs {
            key: ExternalPluginAdapterKey::LinkedAppData(PluginAuthority::UpdateAuthority),
            data: Some(ctx.accounts.cartridge.key.to_bytes().into()),
        },
    }
    .invoke_signed(&[&[
        GAME_PREFIX,
        collection.name.as_bytes(),
        &[args.collection_nonce],
        &[args.collection_bump],
    ]])?;

    // Add the cartridge to the Machine's AppData
    WriteExternalPluginAdapterDataV1Cpi {
        __program: ctx.accounts.mpl_core_program,
        asset: ctx.accounts.machine,
        collection: Some(ctx.accounts.machine_collection),
        payer: ctx.accounts.machine_owner,
        authority: Some(ctx.accounts.machine),
        buffer: None,
        system_program: ctx.accounts.system_program,
        log_wrapper: None,
        __args: WriteExternalPluginAdapterDataV1InstructionArgs {
            key: ExternalPluginAdapterKey::AppData(PluginAuthority::Address {
                address: *ctx.accounts.machine.key,
            }),
            data: Some(ctx.accounts.cartridge.key.to_bytes().into()),
        },
    }
    .invoke_signed(&[&[
        MACHINE_PREFIX,
        ctx.accounts.machine_collection.key.as_ref(),
        machine_name.as_bytes(),
        &[machine_bump],
    ]])?;

    Ok(())
}
