use shank::ShankInstruction;
use strum_macros::{EnumDiscriminants, FromRepr};

use crate::processor::{
    ClaimRewardsV1Args, CreateStakeV1Args, InitializePoolV1Args, SlashV1Args, UnstakeV1Args,
    UpdatePoolV1Args,
};

#[derive(Clone, Debug, ShankInstruction, EnumDiscriminants)]
#[strum_discriminants(derive(FromRepr))]
#[rustfmt::skip]
pub enum BglLegitInstruction {
    /// Initialize a new staking pool.
    /// Creates the staking pool account and reward vault with configurable parameters.
    #[accounts(InitializePoolV1Accounts)]
    InitializePoolV1(InitializePoolV1Args),

    /// Create a new stake.
    /// Stakes tokens into the pool as a specific staker type.
    #[accounts(CreateStakeV1Accounts)]
    CreateStakeV1(CreateStakeV1Args),

    /// Unstake tokens.
    /// Removes staked tokens from the pool (respects lockup periods).
    #[accounts(UnstakeV1Accounts)]
    UnstakeV1(UnstakeV1Args),

    /// Claim accumulated rewards.
    /// Claims pending rewards for a stake account.
    #[accounts(ClaimRewardsV1Accounts)]
    ClaimRewardsV1(ClaimRewardsV1Args),

    /// Update pool configuration.
    /// Updates reward rates, lockup periods, and other pool settings.
    #[accounts(UpdatePoolV1Accounts)]
    UpdatePoolV1(UpdatePoolV1Args),

    /// Slash a stake.
    /// Admin instruction to slash tokens from a stake (for violations).
    #[accounts(SlashV1Accounts)]
    SlashV1(SlashV1Args),
}
