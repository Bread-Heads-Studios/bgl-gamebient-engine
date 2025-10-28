use mpl_core::{
    instructions::{CreateV2Cpi, CreateV2InstructionArgs},
    types::{
        AppDataInitInfo, DataState, ExternalPluginAdapterInitInfo, ExternalPluginAdapterSchema,
        FreezeDelegate, Plugin, PluginAuthority, PluginAuthorityPair,
    },
};
use mpl_utils::{assert_derivation, assert_signer, cmp_pubkeys};
use shank::{ShankAccounts, ShankType};
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError,
    system_program,
};

use crate::{error::BglCartridgeError, state::MACHINE_PREFIX};

#[repr(C)]
#[derive(PartialEq, Eq, Debug, Clone, ShankType)]
pub struct CommissionMachineV1Args {
    name: String,
    uri: String,
}

impl CommissionMachineV1Args {
    pub fn check(&self) -> ProgramResult {
        // Name
        // We don't allow empty names and we limit the length to 32 characters
        // so it can be used as a PDA seed.
        if self.name.is_empty() || self.name.len() > 32 {
            return Err(BglCartridgeError::InvalidName.into());
        }

        // URI
        if self.uri.is_empty() {
            return Err(BglCartridgeError::InvalidUri.into());
        }

        Ok(())
    }
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

#[derive(ShankAccounts)]
pub struct CommissionMachineV1Accounts<'a> {
    #[account(writable, desc = "The new machine asset account")]
    machine: &'a AccountInfo<'a>,

    #[account(writable, desc = "The Core machine collection")]
    machine_collection: &'a AccountInfo<'a>,

    #[account(desc = "The owner of the machine")]
    owner: &'a AccountInfo<'a>,

    #[account(writable, signer, desc = "The account paying for the storage fees")]
    payer: &'a AccountInfo<'a>,

    #[account(optional, signer, desc = "The authority signing for account creation")]
    authority: Option<&'a AccountInfo<'a>>,

    #[account(desc = "The mpl core program")]
    mpl_core_program: &'a AccountInfo<'a>,

    #[account(desc = "The system program")]
    system_program: &'a AccountInfo<'a>,
}

impl CommissionMachineV1Accounts<'_> {
    pub fn check(&self, args: &CommissionMachineV1Args) -> Result<u8, ProgramError> {
        // Machine
        let bump = assert_derivation(
            &crate::ID,
            self.machine,
            &[
                MACHINE_PREFIX,
                self.machine_collection.key.as_ref(),
                args.name.as_bytes(),
            ],
            BglCartridgeError::InvalidMachinePdaDerivation,
        )?;

        // Machine Collection
        // SAFE: Checked by Core

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
}

pub fn create_machine<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = CommissionMachineV1Accounts::context(accounts);

    let args = CommissionMachineV1Args::unpack(args)?;
    args.check()?;
    let bump = ctx.accounts.check(&args)?;

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/
    // Create the Machine
    CreateV2Cpi {
        __program: ctx.accounts.mpl_core_program,
        asset: ctx.accounts.machine,
        collection: Some(ctx.accounts.machine_collection),
        owner: Some(ctx.accounts.owner),
        authority: ctx.accounts.authority,
        update_authority: None,
        payer: ctx.accounts.payer,
        system_program: ctx.accounts.system_program,
        log_wrapper: None,
        __args: CreateV2InstructionArgs {
            name: args.name.clone(),
            uri: args.uri,
            data_state: DataState::AccountState,
            plugins: Some(vec![PluginAuthorityPair {
                plugin: Plugin::FreezeDelegate(FreezeDelegate { frozen: false }),
                authority: None,
            }]),
            external_plugin_adapters: Some(vec![ExternalPluginAdapterInitInfo::AppData(
                AppDataInitInfo {
                    data_authority: PluginAuthority::Address {
                        address: *ctx.accounts.machine.key,
                    },
                    init_plugin_authority: None,
                    schema: Some(ExternalPluginAdapterSchema::Binary),
                },
            )]),
        },
    }
    .invoke_signed(&[&[
        MACHINE_PREFIX,
        ctx.accounts.machine_collection.key.as_ref(),
        args.name.as_bytes(),
        &[bump],
    ]])?;

    Ok(())
}
