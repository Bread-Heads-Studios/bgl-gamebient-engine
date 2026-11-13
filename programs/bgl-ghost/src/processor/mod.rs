pub mod accrue_crown;
pub mod claim_crown;
pub mod create_crown;
pub mod crown_utils;
pub mod end_crown_season;
pub mod reassign_crown;
pub mod update_crown;

pub use accrue_crown::*;
pub use claim_crown::*;
pub use create_crown::*;
pub use end_crown_season::*;
pub use reassign_crown::*;
pub use update_crown::*;

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
        BglGhostInstructionDiscriminants::CreateCrownV1 => {
            msg!("Instruction: Create Crown");
            create_crown(accounts, instruction_data)
        }
        BglGhostInstructionDiscriminants::ClaimCrownV1 => {
            msg!("Instruction: Claim Crown");
            claim_crown(accounts, instruction_data)
        }
        BglGhostInstructionDiscriminants::AccrueCrownV1 => {
            msg!("Instruction: Accrue Crown");
            accrue_crown(accounts, instruction_data)
        }
        BglGhostInstructionDiscriminants::UpdateCrownV1 => {
            msg!("Instruction: Update Crown");
            update_crown(accounts, instruction_data)
        }
        BglGhostInstructionDiscriminants::EndCrownSeasonV1 => {
            msg!("Instruction: End Crown Season");
            end_crown_season(accounts, instruction_data)
        }
        BglGhostInstructionDiscriminants::ReassignCrownV1 => {
            msg!("Instruction: Reassign Crown");
            reassign_crown(accounts, instruction_data)
        }
    }
}
