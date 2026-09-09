use mpl_core::instructions::{CreateGroupV1Cpi, CreateGroupV1InstructionArgs};
use mpl_utils::{assert_derivation, assert_signer, cmp_pubkeys};
use shank::ShankType;
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError,
};
use solana_system_interface::program as system_program;

use crate::{
    error::BglCartridgeError, instruction::accounts::CreateLibraryV1Accounts, state::LIBRARY_PREFIX,
};

#[repr(C)]
#[derive(PartialEq, Eq, Debug, Clone, ShankType)]
pub struct CreateLibraryV1Args {
    /// The name of the group.
    name: String,
    /// The metadata URI of the group.
    uri: String,
}

impl CreateLibraryV1Args {
    pub fn check(&self) -> ProgramResult {
        if self.name.is_empty() {
            return Err(BglCartridgeError::InvalidName.into());
        }

        if self.uri.is_empty() {
            return Err(BglCartridgeError::InvalidUri.into());
        }

        Ok(())
    }

    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        // Skip the discriminator
        let mut offset = 1;

        let name = read_string(input, &mut offset)?;
        let uri = read_string(input, &mut offset)?;

        Ok(Self { name, uri })
    }
}

/// Reads a Borsh string (u32 little-endian length prefix + UTF-8 bytes).
fn read_string(input: &[u8], offset: &mut usize) -> Result<String, ProgramError> {
    let len = u32::from_le_bytes(
        input
            .get(*offset..*offset + 4)
            .ok_or(ProgramError::InvalidInstructionData)?
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    ) as usize;
    *offset += 4;

    let bytes = input
        .get(*offset..*offset + len)
        .ok_or(ProgramError::InvalidInstructionData)?;
    *offset += len;

    String::from_utf8(bytes.to_vec()).map_err(|_| ProgramError::InvalidInstructionData)
}

impl CreateLibraryV1Accounts<'_> {
    pub fn check(&self) -> Result<u8, ProgramError> {
        let Self {
            library,
            group,
            curator,
            payer,
            mpl_core_program,
            system_program,
        } = self;

        // Curator
        assert_signer(curator).map_err(|_| BglCartridgeError::CuratorMustSign)?;

        // Library
        let bump = assert_derivation(
            &crate::ID,
            library,
            &[LIBRARY_PREFIX, curator.key.as_ref()],
            BglCartridgeError::InvalidLibraryPdaDerivation,
        )?;

        // Group
        // SAFE: Fresh account, fully checked by Core during the create CPI.
        assert_signer(group)?;

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

        Ok(bump)
    }
}

pub fn create_library<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = CreateLibraryV1Accounts::context(accounts)?;

    let args = CreateLibraryV1Args::unpack(args)?;
    args.check()?;
    let bump = ctx.accounts.check()?;

    // Create the group with the library authority PDA as its update
    // authority. Core requires the update authority to sign, which is why
    // group creation has to go through this program.
    CreateGroupV1Cpi {
        __program: ctx.accounts.mpl_core_program,
        group: ctx.accounts.group,
        update_authority: Some(ctx.accounts.library),
        payer: ctx.accounts.payer,
        system_program: ctx.accounts.system_program,
        __args: CreateGroupV1InstructionArgs {
            name: args.name,
            uri: args.uri,
            relationships: vec![],
        },
    }
    .invoke_signed(&[&[LIBRARY_PREFIX, ctx.accounts.curator.key.as_ref(), &[bump]]])?;

    Ok(())
}
