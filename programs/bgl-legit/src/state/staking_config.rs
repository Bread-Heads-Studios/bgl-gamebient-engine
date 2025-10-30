use bytemuck::{Pod, Zeroable};
use shank::ShankType;
use solana_program::clock::UnixTimestamp;

/// The configuration type for different staking roles.
#[repr(C)]
#[derive(Pod, Zeroable, Eq, PartialEq, Copy, Clone, Debug, ShankType)]
pub struct StakingConfig {
    /// TODO: Define exact reward calculation formula
    /// The reward rate for the staking role.
    pub reward_rate: u64,

    /// The lockup period for the staking role.
    #[idl_type(i64)]
    pub lockup_period: UnixTimestamp,
}
