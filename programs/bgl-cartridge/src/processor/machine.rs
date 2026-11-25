use mpl_core::{
    instructions::{
        WriteExternalPluginAdapterDataV1Cpi, WriteExternalPluginAdapterDataV1InstructionArgs,
    },
    types::{ExternalPluginAdapterKey, PluginAuthority},
};
use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult};

use crate::state::{MachineData, MACHINE_PREFIX};

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
