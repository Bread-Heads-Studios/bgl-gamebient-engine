use bytemuck::{Pod, Zeroable};
use shank::ShankType;
use solana_program::pubkey::Pubkey;

use crate::state::StakingConfig;

use super::StakerType;

/// Staking pool configuration
/// This account holds the global configuration for the staking pool
#[repr(C)]
#[derive(Pod, Zeroable, Copy, Clone, Debug, ShankType)]
pub struct StakingPool {
    /// The authority that can update pool configuration and perform slashing
    pub authority: Pubkey,

    /// The token mint for staking and rewards
    pub mint: Pubkey,

    /// Configuration for machine owners
    pub machine_owner_config: StakingConfig,

    /// Configuration for game creators
    pub game_creator_config: StakingConfig,

    /// Total amount staked across all users
    pub total_staked: u64,

    /// Whether the pool is currently active (0 = inactive, 1 = active)
    pub is_active: u8,

    /// Padding for 8-byte alignment
    pub _padding: [u8; 7],
}

impl StakingPool {
    /// Initialize the staking pool
    pub fn initialize(
        &mut self,
        authority: Pubkey,
        mint: Pubkey,
        machine_owner_config: StakingConfig,
        game_creator_config: StakingConfig,
    ) {
        self.authority = authority;
        self.mint = mint;
        self.machine_owner_config = machine_owner_config;
        self.game_creator_config = game_creator_config;
    }

    /// Get the reward rate for a specific staker type
    pub fn get_reward_rate(&self, staker_type: StakerType) -> u64 {
        match staker_type {
            StakerType::MachineOwner => self.machine_owner_config.reward_rate,
            StakerType::GameCreator => self.game_creator_config.reward_rate,
        }
    }

    /// Get the lockup period for a specific staker type
    pub fn get_lockup_period(&self, staker_type: StakerType) -> i64 {
        match staker_type {
            StakerType::MachineOwner => self.machine_owner_config.lockup_period,
            StakerType::GameCreator => self.game_creator_config.lockup_period,
        }
    }
}
