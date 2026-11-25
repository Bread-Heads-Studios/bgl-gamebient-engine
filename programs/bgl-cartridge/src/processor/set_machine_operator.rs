use borsh::{BorshDeserialize, BorshSerialize};
use mpl_utils::{assert_signer, cmp_pubkeys};
use shank::ShankType;
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError,
    pubkey::Pubkey,
};
use solana_system_interface::program as system_program;

use super::machine::{load_machine, write_machine_data, MachineWrite};
use crate::{
    error::BglCartridgeError, instruction::accounts::SetMachineOperatorV1Accounts,
    state::MachineData,
};

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Eq, Debug, Clone, ShankType)]
pub struct SetMachineOperatorV1Args {
    /// The cabinet's device key. The all-zero key revokes the operator.
    pub operator: Pubkey,
}

impl SetMachineOperatorV1Args {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        // Skip the discriminator. Borsh rejects trailing bytes.
        Self::try_from_slice(input.get(1..).ok_or(ProgramError::InvalidInstructionData)?)
            .map_err(|_| ProgramError::InvalidInstructionData)
    }
}

impl SetMachineOperatorV1Accounts<'_> {
    /// Every guard runs here, before any CPI. Returns the machine's name and
    /// PDA bump.
    pub fn check(&self) -> Result<(String, u8), ProgramError> {
        // Machine & Machine Collection — a Core asset at the machine PDA.
        let (machine, bump) = load_machine(self.machine, self.machine_collection)?;

        // Owner — the machine's owner must sign.
        assert_signer(self.owner).map_err(|_| BglCartridgeError::MachineOwnerMustSign)?;
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

        Ok((machine.name, bump))
    }
}

/// Replaces the machine's operator key. Only the machine's owner can.
pub fn set_machine_operator<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = SetMachineOperatorV1Accounts::context(accounts)?;

    let args = SetMachineOperatorV1Args::unpack(args)?;
    let (name, bump) = ctx.accounts.check()?;

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/
    write_machine_data(
        &MachineWrite {
            mpl_core_program: ctx.accounts.mpl_core_program,
            machine: ctx.accounts.machine,
            machine_collection: ctx.accounts.machine_collection,
            payer: ctx.accounts.payer,
            system_program: ctx.accounts.system_program,
        },
        &name,
        bump,
        &MachineData::new(args.operator),
    )
}
