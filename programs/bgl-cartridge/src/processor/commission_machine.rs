use borsh::{BorshDeserialize, BorshSerialize};
use mpl_core::{
    instructions::{CreateV2Cpi, CreateV2InstructionArgs},
    types::{
        AppDataInitInfo, DataState, ExternalPluginAdapterInitInfo, ExternalPluginAdapterSchema,
        FreezeDelegate, Plugin, PluginAuthority, PluginAuthorityPair,
    },
};
use mpl_utils::{assert_derivation, assert_signer, cmp_pubkeys};
use shank::ShankType;
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError,
    pubkey::Pubkey,
};
use solana_system_interface::program as system_program;

use super::machine::{write_machine_data, MachineWrite};
use crate::{
    error::BglCartridgeError,
    instruction::accounts::{CommissionMachineV1Accounts, CommissionMachineV2Accounts},
    state::{MachineData, MACHINE_PREFIX},
};

#[repr(C)]
#[derive(PartialEq, Eq, Debug, Clone, ShankType)]
pub struct CommissionMachineV1Args {
    name: String,
    uri: String,
}

impl CommissionMachineV1Args {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        // Skip the discriminator
        let mut offset = 1;

        // Read name length (4 bytes, little-endian like Borsh)
        let name_len = u32::from_le_bytes(
            input[offset..offset + 4]
                .try_into()
                .map_err(|_| ProgramError::InvalidInstructionData)?,
        ) as usize;
        offset += 4;

        // Read name bytes
        let name = String::from_utf8(input[offset..offset + name_len].to_vec())
            .map_err(|_| ProgramError::InvalidInstructionData)?;
        offset += name_len;

        // Read URI length
        let uri_len = u32::from_le_bytes(
            input[offset..offset + 4]
                .try_into()
                .map_err(|_| ProgramError::InvalidInstructionData)?,
        ) as usize;
        offset += 4;

        // Read URI bytes
        let uri = String::from_utf8(input[offset..offset + uri_len].to_vec())
            .map_err(|_| ProgramError::InvalidInstructionData)?;

        Ok(Self { name, uri })
    }
}

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Eq, Debug, Clone, ShankType)]
pub struct CommissionMachineV2Args {
    pub name: String,
    pub uri: String,
    /// The cabinet's device key. The all-zero key means no operator.
    pub operator: Pubkey,
}

impl CommissionMachineV2Args {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        // Skip the discriminator. Borsh rejects trailing bytes.
        Self::try_from_slice(input.get(1..).ok_or(ProgramError::InvalidInstructionData)?)
            .map_err(|_| ProgramError::InvalidInstructionData)
    }
}

/// The name is a PDA seed, so it is 1-32 bytes. The URI must not be empty.
fn check_name_and_uri(name: &str, uri: &str) -> ProgramResult {
    if name.is_empty() || name.len() > 32 {
        return Err(BglCartridgeError::InvalidName.into());
    }
    if uri.is_empty() {
        return Err(BglCartridgeError::InvalidUri.into());
    }
    Ok(())
}

/// The accounts both commission instructions use.
struct Commission<'a, 'b> {
    machine: &'b AccountInfo<'a>,
    machine_collection: &'b AccountInfo<'a>,
    owner: &'b AccountInfo<'a>,
    payer: &'b AccountInfo<'a>,
    authority: Option<&'b AccountInfo<'a>>,
    mpl_core_program: &'b AccountInfo<'a>,
    system_program: &'b AccountInfo<'a>,
}

impl Commission<'_, '_> {
    /// Every guard runs here, before any CPI. Returns the machine PDA bump.
    fn check(&self, name: &str) -> Result<u8, ProgramError> {
        // Machine
        let bump = assert_derivation(
            &crate::ID,
            self.machine,
            &[
                MACHINE_PREFIX,
                self.machine_collection.key.as_ref(),
                name.as_bytes(),
            ],
            BglCartridgeError::InvalidMachinePdaDerivation,
        )?;

        // Machine Collection
        // SAFE: Checked by Core, which also requires the collection's update
        // authority (`authority`, or the payer without one) to sign.

        // Owner
        // SAFE: No need to check

        // Payer
        assert_signer(self.payer).map_err(|_| BglCartridgeError::PayerMustSign)?;

        // Authority
        if let Some(authority) = self.authority {
            assert_signer(authority).map_err(|_| BglCartridgeError::AuthorityMustSign)?;
        }

        // MPL Core Program
        if !cmp_pubkeys(self.mpl_core_program.key, &mpl_core::ID) {
            return Err(BglCartridgeError::InvalidMplCoreProgram.into());
        }

        // System Program
        if !cmp_pubkeys(self.system_program.key, &system_program::ID) {
            return Err(BglCartridgeError::InvalidSystemProgram.into());
        }

        Ok(bump)
    }

    /// Creates the machine asset at its PDA with an empty AppData whose data
    /// authority is the machine itself.
    fn create(&self, name: &str, uri: String, bump: u8) -> ProgramResult {
        CreateV2Cpi {
            __program: self.mpl_core_program,
            asset: self.machine,
            collection: Some(self.machine_collection),
            owner: Some(self.owner),
            authority: self.authority,
            update_authority: None,
            payer: self.payer,
            system_program: self.system_program,
            log_wrapper: None,
            __args: CreateV2InstructionArgs {
                name: name.to_string(),
                uri,
                data_state: DataState::AccountState,
                plugins: Some(vec![PluginAuthorityPair {
                    plugin: Plugin::FreezeDelegate(FreezeDelegate { frozen: false }),
                    authority: None,
                }]),
                external_plugin_adapters: Some(vec![ExternalPluginAdapterInitInfo::AppData(
                    AppDataInitInfo {
                        data_authority: PluginAuthority::Address {
                            address: *self.machine.key,
                        },
                        init_plugin_authority: None,
                        schema: Some(ExternalPluginAdapterSchema::Binary),
                    },
                )]),
            },
        }
        .invoke_signed(&[&[
            MACHINE_PREFIX,
            self.machine_collection.key.as_ref(),
            name.as_bytes(),
            &[bump],
        ]])
    }
}

pub fn create_machine<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = CommissionMachineV1Accounts::context(accounts)?;

    let args = CommissionMachineV1Args::unpack(args)?;
    check_name_and_uri(&args.name, &args.uri)?;

    let commission = Commission {
        machine: ctx.accounts.machine,
        machine_collection: ctx.accounts.machine_collection,
        owner: ctx.accounts.owner,
        payer: ctx.accounts.payer,
        authority: ctx.accounts.authority,
        mpl_core_program: ctx.accounts.mpl_core_program,
        system_program: ctx.accounts.system_program,
    };
    let bump = commission.check(&args.name)?;

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/
    commission.create(&args.name, args.uri, bump)
}

/// Commissions a machine and records its operator (the cabinet's device key)
/// in the same instruction, so no owner signature is needed to bring a
/// cabinet online.
pub fn commission_machine_v2<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = CommissionMachineV2Accounts::context(accounts)?;

    let args = CommissionMachineV2Args::unpack(args)?;
    check_name_and_uri(&args.name, &args.uri)?;

    let commission = Commission {
        machine: ctx.accounts.machine,
        machine_collection: ctx.accounts.machine_collection,
        owner: ctx.accounts.owner,
        payer: ctx.accounts.payer,
        authority: ctx.accounts.authority,
        mpl_core_program: ctx.accounts.mpl_core_program,
        system_program: ctx.accounts.system_program,
    };
    let bump = commission.check(&args.name)?;

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/
    commission.create(&args.name, args.uri, bump)?;

    write_machine_data(
        &MachineWrite {
            mpl_core_program: ctx.accounts.mpl_core_program,
            machine: ctx.accounts.machine,
            machine_collection: ctx.accounts.machine_collection,
            payer: ctx.accounts.payer,
            system_program: ctx.accounts.system_program,
        },
        &args.name,
        bump,
        &MachineData::new(args.operator),
    )
}
