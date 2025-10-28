use bytemuck::{Pod, Zeroable};
use shank::ShankType;
use solana_program::pubkey::Pubkey;

use super::{StakerType, StakingPool};

/// Individual stake account for a user
#[repr(C)]
#[derive(Pod, Zeroable, Copy, Clone, Debug, ShankType)]
pub struct StakeAccount {
    /// The staking pool this stake belongs to
    pub pool: Pubkey,

    /// The owner of this stake
    pub owner: Pubkey,

    /// Amount currently staked
    pub amount_staked: u64,

    /// Timestamp when the stake was created
    pub stake_start_time: i64,

    /// Timestamp when the lockup period ends
    pub lockup_end_time: i64,

    /// Last time rewards were calculated/claimed
    pub last_reward_time: i64,

    /// Total rewards claimed by this account
    pub total_rewards_claimed: u64,

    /// The type of staker (stored as u8)
    pub staker_type: u8,

    /// Padding for 8-byte alignment
    pub _padding: [u8; 7],
}

impl StakeAccount {
    /// Check if the stake is currently locked
    pub fn is_locked(&self, current_time: i64) -> bool {
        current_time < self.lockup_end_time
    }

    /// Get the staker type as an enum
    pub fn get_staker_type(&self) -> Option<StakerType> {
        match self.staker_type {
            0 => Some(StakerType::MachineOwner),
            1 => Some(StakerType::GameCreator),
            2 => Some(StakerType::GhostOwner),
            _ => None,
        }
    }

    /// Calculate pending rewards for this stake
    /// TODO: Implement exact reward calculation logic
    /// This is a placeholder that needs the actual formula
    pub fn calculate_pending_rewards(&self, _pool: &StakingPool, _current_time: i64) -> u64 {
        // TODO: Implement reward calculation based on:
        // - amount_staked
        // - time since last_reward_time
        // - reward rate from pool based on staker_type
        0
    }
}
