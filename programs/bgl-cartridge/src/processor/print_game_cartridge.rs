use bytemuck::{from_bytes, Pod, Zeroable};
use mpl_core::{
    accounts::BaseCollectionV1,
    instructions::{CreateV2Cpi, CreateV2InstructionArgs},
    types::{DataState, Edition, Plugin, PluginAuthorityPair},
};
use mpl_utils::{assert_signer, cmp_pubkeys};
use shank::{ShankAccounts, ShankType};
use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult, system_program};

use crate::{error::BglCartridgeError, state::GAME_PREFIX};

#[repr(C)]
#[derive(Pod, Zeroable, PartialEq, Eq, Debug, Copy, Clone, ShankType)]
pub struct PrintGameCartridgeV1Args {
    #[skip]
    /// The discriminator for the instruction
    discriminator: u8,
    /// The nonce for the collection
    collection_nonce: u8,
    /// The bump for the collection
    collection_bump: u8,
}

#[derive(ShankAccounts)]
pub struct PrintGameCartridgeV1Accounts<'a> {
    #[account(writable, signer, desc = "The new game asset account")]
    cartridge: &'a AccountInfo<'a>,

    #[account(writable, desc = "The game Collection account")]
    game: &'a AccountInfo<'a>,

    #[account(desc = "The owner of the game")]
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

impl PrintGameCartridgeV1Accounts<'_> {
    pub fn check(&self) -> ProgramResult {
        // Game
        // SAFE: Checked by Core

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

        Ok(())
    }
}

pub fn print_game_cartridge<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = PrintGameCartridgeV1Accounts::context(accounts);
    solana_program::msg!("Printing game cartridge");

    // All account guards and validations happen here.
    ctx.accounts.check()?;
    solana_program::msg!("Account checks passed");

    let args: &PrintGameCartridgeV1Args = from_bytes(args);
    solana_program::msg!("Args parsed");

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/
    // Fetch the collection data so we can derive the PDA signer
    let collection = BaseCollectionV1::from_bytes(ctx.accounts.game.try_borrow_data()?.as_ref())?;
    solana_program::msg!("Collection fetched");
    // Create the Game Cartridge
    // We need to fetch the count to use as the edition number
    let name = format!("{} {}", collection.name, collection.num_minted + 1);
    solana_program::msg!("Name formatted");
    CreateV2Cpi {
        __program: ctx.accounts.mpl_core_program,
        asset: ctx.accounts.cartridge,
        collection: Some(ctx.accounts.game),
        owner: Some(ctx.accounts.owner),
        authority: Some(ctx.accounts.game),
        update_authority: None,
        payer: ctx.accounts.payer,
        system_program: ctx.accounts.system_program,
        log_wrapper: None,
        __args: CreateV2InstructionArgs {
            name,
            uri: collection.uri,
            data_state: DataState::AccountState,
            plugins: Some(vec![PluginAuthorityPair {
                plugin: Plugin::Edition(Edition {
                    number: collection.num_minted + 1,
                }),
                authority: None,
            }]),
            external_plugin_adapters: None,
        },
    }
    .invoke_signed(&[&[
        GAME_PREFIX,
        collection.name.as_bytes(),
        &[args.collection_nonce],
        &[args.collection_bump],
    ]])?;
    solana_program::msg!("Game cartridge printed");

    Ok(())
}
