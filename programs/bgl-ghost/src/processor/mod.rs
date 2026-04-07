pub mod create_ghost;
pub mod expire_ghost;
pub mod use_ghost;

pub use create_ghost::*;
pub use expire_ghost::*;
pub use use_ghost::*;

use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, msg, program_error::ProgramError,
    pubkey::Pubkey,
};

use crate::instruction::BglGhostInstructionDiscriminants;

pub fn process_instruction<'a>(
    _program_id: &Pubkey,
    accounts: &'a [AccountInfo<'a>],
    instruction_data: &[u8],
) -> ProgramResult {
    match BglGhostInstructionDiscriminants::from_repr(instruction_data[0] as usize)
        .ok_or(ProgramError::InvalidInstructionData)?
    {
        BglGhostInstructionDiscriminants::CreateGhostV1 => {
            msg!("Instruction: Create Ghost");
            create_ghost(accounts, instruction_data)
        }
        BglGhostInstructionDiscriminants::UseGhostV1 => {
            msg!("Instruction: Use Ghost");
            use_ghost(accounts, instruction_data)
        }
        BglGhostInstructionDiscriminants::ExpireGhostV1 => {
            msg!("Instruction: Expire Ghost");
            expire_ghost(accounts, instruction_data)
        }
    }
}
