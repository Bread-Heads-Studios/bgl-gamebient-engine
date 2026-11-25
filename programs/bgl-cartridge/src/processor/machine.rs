use mpl_core::{
    accounts::BaseAssetV1,
    instructions::{
        WriteExternalPluginAdapterDataV1Cpi, WriteExternalPluginAdapterDataV1InstructionArgs,
    },
    types::{ExternalPluginAdapterKey, Key, PluginAuthority, UpdateAuthority},
};
use mpl_utils::{assert_derivation, assert_owned_by};
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError,
};

use crate::{
    error::BglCartridgeError,
    state::{MachineData, MACHINE_PREFIX},
};

/// Loads a machine and checks it is a Core asset that sits at the machine PDA
/// of `machine_collection` and whose update authority is that collection.
/// Returns the asset and the PDA bump.
pub(crate) fn load_machine(
    machine: &AccountInfo,
    machine_collection: &AccountInfo,
) -> Result<(BaseAssetV1, u8), ProgramError> {
    assert_owned_by(machine, &mpl_core::ID, BglCartridgeError::InvalidMachine)?;
    let asset = BaseAssetV1::from_bytes(machine.try_borrow_data()?.as_ref())
        .map_err(|_| BglCartridgeError::InvalidMachine)?;
    // A name over 32 bytes cannot be a PDA seed, so it cannot be a machine.
    if asset.key != Key::AssetV1 || asset.name.len() > 32 {
        return Err(BglCartridgeError::InvalidMachine.into());
    }
    // Checked directly, so the rule does not rest on only this program being
    // able to create an asset at the PDA.
    if asset.update_authority != UpdateAuthority::Collection(*machine_collection.key) {
        return Err(BglCartridgeError::InvalidMachine.into());
    }
    let bump = assert_derivation(
        &crate::ID,
        machine,
        &[
            MACHINE_PREFIX,
            machine_collection.key.as_ref(),
            asset.name.as_bytes(),
        ],
        BglCartridgeError::InvalidMachinePdaDerivation,
    )?;
    Ok((asset, bump))
}

/// The accounts a write to a machine's AppData touches.
pub(crate) struct MachineWrite<'a, 'b> {
    pub mpl_core_program: &'b AccountInfo<'a>,
    pub machine: &'b AccountInfo<'a>,
    pub machine_collection: &'b AccountInfo<'a>,
    pub payer: &'b AccountInfo<'a>,
    pub system_program: &'b AccountInfo<'a>,
}

/// Writes `data` to the machine's AppData, signing as the machine PDA (the
/// AppData's data authority). `name` and `bump` are the machine's PDA seeds.
pub(crate) fn write_machine_data(
    w: &MachineWrite,
    name: &str,
    bump: u8,
    data: &MachineData,
) -> ProgramResult {
    WriteExternalPluginAdapterDataV1Cpi {
        __program: w.mpl_core_program,
        asset: w.machine,
        collection: Some(w.machine_collection),
        payer: w.payer,
        authority: Some(w.machine),
        buffer: None,
        system_program: w.system_program,
        log_wrapper: None,
        __args: WriteExternalPluginAdapterDataV1InstructionArgs {
            key: ExternalPluginAdapterKey::AppData(PluginAuthority::Address {
                address: *w.machine.key,
            }),
            data: Some(borsh::to_vec(data)?),
        },
    }
    .invoke_signed(&[&[
        MACHINE_PREFIX,
        w.machine_collection.key.as_ref(),
        name.as_bytes(),
        &[bump],
    ]])
}
