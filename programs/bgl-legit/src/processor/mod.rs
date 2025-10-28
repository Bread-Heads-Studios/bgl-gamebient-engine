pub mod claim_rewards;
pub mod create_stake;
pub mod initialize_pool;
pub mod slash;
pub mod unstake;
pub mod update_pool;

pub use claim_rewards::*;
pub use create_stake::*;
pub use initialize_pool::*;
pub use slash::*;
pub use unstake::*;
pub use update_pool::*;

use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, msg, program_error::ProgramError,
    pubkey::Pubkey,
};

use crate::instruction::BglLegitInstructionDiscriminants;

pub fn process_instruction<'a>(
    _program_id: &Pubkey,
    accounts: &'a [AccountInfo<'a>],
    instruction_data: &[u8],
) -> ProgramResult {
    match BglLegitInstructionDiscriminants::from_repr(instruction_data[0] as usize)
        .ok_or(ProgramError::InvalidInstructionData)?
    {
        BglLegitInstructionDiscriminants::InitializePoolV1 => {
            msg!("Instruction: Initialize Pool");
            initialize_pool(accounts, instruction_data)
        }
        BglLegitInstructionDiscriminants::CreateStakeV1 => {
            msg!("Instruction: Create Stake");
            create_stake(accounts, instruction_data)
        }
        BglLegitInstructionDiscriminants::UnstakeV1 => {
            msg!("Instruction: Unstake");
            unstake(accounts, instruction_data)
        }
        BglLegitInstructionDiscriminants::ClaimRewardsV1 => {
            msg!("Instruction: Claim Rewards");
            claim_rewards(accounts, instruction_data)
        }
        BglLegitInstructionDiscriminants::UpdatePoolV1 => {
            msg!("Instruction: Update Pool");
            update_pool(accounts, instruction_data)
        }
        BglLegitInstructionDiscriminants::SlashV1 => {
            msg!("Instruction: Slash");
            slash(accounts, instruction_data)
        }
    }
}
