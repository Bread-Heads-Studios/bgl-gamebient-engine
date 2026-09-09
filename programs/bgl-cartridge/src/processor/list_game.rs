use bytemuck::{from_bytes, Pod, Zeroable};
use mpl_core::{instructions::AddCollectionsToGroupV1Cpi, types::Key};
use mpl_utils::{assert_owned_by, assert_signer, cmp_pubkeys};
use shank::ShankType;
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError,
    pubkey::Pubkey,
};
use solana_system_interface::program as system_program;

use crate::{
    error::BglCartridgeError, instruction::accounts::ListGameV1Accounts, state::LIBRARY_PREFIX,
};

#[repr(C)]
#[derive(Pod, Zeroable, PartialEq, Eq, Debug, Copy, Clone, ShankType)]
pub struct ListGameV1Args {
    #[skip]
    /// The discriminator for the instruction
    discriminator: u8,
    /// The bump for the library authority PDA
    library_bump: u8,
}

/// Checks that `library` is `[LIBRARY_PREFIX, curator]` under this program
/// for the supplied bump.
pub(crate) fn assert_library_derivation(
    library: &AccountInfo,
    curator: &AccountInfo,
    bump: u8,
) -> ProgramResult {
    let expected = Pubkey::create_program_address(
        &[LIBRARY_PREFIX, curator.key.as_ref(), &[bump]],
        &crate::ID,
    )
    .map_err(|_| BglCartridgeError::InvalidLibraryPdaDerivation)?;

    if !cmp_pubkeys(library.key, &expected) {
        return Err(BglCartridgeError::InvalidLibraryPdaDerivation.into());
    }

    Ok(())
}

/// Checks that `group` is a Core GroupV1 account.
pub(crate) fn assert_group(group: &AccountInfo) -> ProgramResult {
    assert_owned_by(group, &mpl_core::ID, BglCartridgeError::InvalidGroup)?;

    let data = group.try_borrow_data()?;
    if data.first().copied() != Some(Key::GroupV1 as u8) {
        return Err(BglCartridgeError::InvalidGroup.into());
    }

    Ok(())
}

impl ListGameV1Accounts<'_> {
    pub fn check(&self, args: &ListGameV1Args) -> Result<(), ProgramError> {
        let Self {
            library,
            group,
            game,
            curator,
            payer,
            mpl_core_program,
            system_program,
        } = self;

        // Curator
        assert_signer(curator).map_err(|_| BglCartridgeError::CuratorMustSign)?;

        // Library
        assert_library_derivation(library, curator, args.library_bump)?;

        // Group
        assert_group(group)?;

        // Game
        // SAFE: Core verifies it is a collection whose UpdateDelegate names
        //       the library authority.
        assert_owned_by(
            game,
            &mpl_core::ID,
            BglCartridgeError::InvalidMplCoreProgram,
        )?;

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

pub fn list_game<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = ListGameV1Accounts::context(accounts)?;

    let args: &ListGameV1Args = from_bytes(args);
    ctx.accounts.check(args)?;

    // The library authority PDA is both the group's update authority and the
    // game's UpdateDelegate, which is the dual check Core applies. The game
    // goes in as a remaining account (writable, non-signer).
    AddCollectionsToGroupV1Cpi {
        __program: ctx.accounts.mpl_core_program,
        group: ctx.accounts.group,
        payer: ctx.accounts.payer,
        authority: Some(ctx.accounts.library),
        system_program: ctx.accounts.system_program,
    }
    .invoke_signed_with_remaining_accounts(
        &[&[
            LIBRARY_PREFIX,
            ctx.accounts.curator.key.as_ref(),
            &[args.library_bump],
        ]],
        &[(ctx.accounts.game, true, false)],
    )?;

    Ok(())
}
