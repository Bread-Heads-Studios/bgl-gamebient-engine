pub mod commission_machine;
pub mod insert_cartridge;
mod payment;
pub mod print_game_cartridge;
pub mod print_look;
pub mod register_look;
pub mod release_game;
pub mod remove_cartridge;
pub mod set_cartridge_source;
pub mod update_game_price;
pub mod update_look;

pub use commission_machine::*;
pub use insert_cartridge::*;
pub use print_game_cartridge::*;
pub use print_look::*;
pub use register_look::*;
pub use release_game::*;
pub use remove_cartridge::*;
pub use set_cartridge_source::*;
pub use update_game_price::*;
pub use update_look::*;

use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, msg, program_error::ProgramError,
    pubkey::Pubkey,
};

use crate::instruction::BglCartridgeInstructionDiscriminants;

pub fn process_instruction<'a>(
    _program_id: &Pubkey,
    accounts: &'a [AccountInfo<'a>],
    instruction_data: &[u8],
) -> ProgramResult {
    match BglCartridgeInstructionDiscriminants::from_repr(instruction_data[0] as usize)
        .ok_or(ProgramError::InvalidInstructionData)?
    {
        BglCartridgeInstructionDiscriminants::CommissionMachineV1 => {
            msg!("Instruction: Commission Machine");
            create_machine(accounts, instruction_data)
        }
        BglCartridgeInstructionDiscriminants::ReleaseGameV1 => {
            msg!("Instruction: Release Game");
            release_game(accounts, instruction_data)
        }
        BglCartridgeInstructionDiscriminants::PrintGameCartridgeV1 => {
            msg!("Instruction: Print Game Cartridge");
            print_game_cartridge(accounts, instruction_data)
        }
        BglCartridgeInstructionDiscriminants::InsertCartridgeV1 => {
            msg!("Instruction: Insert Cartridge");
            insert_cartridge(accounts, instruction_data)
        }
        BglCartridgeInstructionDiscriminants::RemoveCartridgeV1 => {
            msg!("Instruction: Remove Cartridge");
            remove_cartridge(accounts, instruction_data)
        }
        BglCartridgeInstructionDiscriminants::SetCartridgeSourceV1 => {
            msg!("Instruction: Set Cartridge Source");
            set_cartridge_source(accounts, instruction_data)
        }
        BglCartridgeInstructionDiscriminants::UpdateGamePriceV1 => {
            msg!("Instruction: Update Game Price");
            update_game_price(accounts, instruction_data)
        }
        BglCartridgeInstructionDiscriminants::RegisterLookV1 => {
            msg!("Instruction: Register Look");
            register_look(accounts, instruction_data)
        }
        BglCartridgeInstructionDiscriminants::UpdateLookV1 => {
            msg!("Instruction: Update Look");
            update_look(accounts, instruction_data)
        }
        BglCartridgeInstructionDiscriminants::PrintLookV1 => {
            msg!("Instruction: Print Look");
            print_look(accounts, instruction_data)
        }
    }
}
