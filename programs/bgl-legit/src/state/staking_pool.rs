use bytemuck::{Pod, Zeroable};
use shank::ShankType;
use solana_program::pubkey::Pubkey;

use super::StakerType;

/// Staking pool configuration
/// This account holds the global configuration for the staking pool
#[repr(C)]
#[derive(Pod, Zeroable, Copy, Clone, Debug, ShankType)]
pub struct StakingPool {
    /// The authority that can update pool configuration and perform slashing
    pub authority: Pubkey,

    /// The token mint for staking and rewards
    pub token_mint: Pubkey,

    /// The vault holding staked tokens and rewards
    pub vault: Pubkey,

    /// Reward rate for machine owners (basis points per day)
    /// TODO: Define exact reward calculation formula
    pub machine_owner_reward_rate: u64,

    /// Reward rate for game creators (basis points per day)
    /// TODO: Define exact reward calculation formula
    pub game_creator_reward_rate: u64,

    /// Reward rate for ghost owners (basis points per day)
    /// TODO: Define exact reward calculation formula
    pub ghost_owner_reward_rate: u64,

    /// Lockup period for machine owners (seconds)
    pub machine_owner_lockup_period: i64,

    /// Lockup period for game creators (seconds)
    pub game_creator_lockup_period: i64,

    /// Lockup period for ghost owners (seconds)
    pub ghost_owner_lockup_period: i64,

    /// Total amount staked across all users
    pub total_staked: u64,

    /// Whether the pool is currently active (0 = inactive, 1 = active)
    pub is_active: u64,
}

impl StakingPool {
    /// Get the reward rate for a specific staker type
    pub fn get_reward_rate(&self, staker_type: StakerType) -> u64 {
        match staker_type {
            StakerType::MachineOwner => self.machine_owner_reward_rate,
            StakerType::GameCreator => self.game_creator_reward_rate,
            StakerType::GhostOwner => self.ghost_owner_reward_rate,
        }
    }

    /// Get the lockup period for a specific staker type
    pub fn get_lockup_period(&self, staker_type: StakerType) -> i64 {
        match staker_type {
            StakerType::MachineOwner => self.machine_owner_lockup_period,
            StakerType::GameCreator => self.game_creator_lockup_period,
            StakerType::GhostOwner => self.ghost_owner_lockup_period,
        }
    }
}
