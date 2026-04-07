use shank::{ShankContext, ShankInstruction};
use strum_macros::{EnumDiscriminants, FromRepr};

use crate::processor::{
    ClaimRewardsV1Args, CreateStakeV1Args, InitializePoolV1Args, SlashV1Args, UnstakeV1Args,
    UpdatePoolV1Args,
};

#[derive(Clone, Debug, ShankContext, ShankInstruction, EnumDiscriminants)]
#[strum_discriminants(derive(FromRepr))]
#[rustfmt::skip]
pub enum BglLegitInstruction {
    /// Initialize a new staking pool.
    /// Creates the staking pool account and reward vault with configurable parameters.
    #[account(0, writable, name = "pool", desc = "The staking pool account")]
    #[account(1, name = "mint", desc = "The token mint for staking")]
    #[account(2, signer, name = "authority", desc = "The authority of the pool")]
    #[account(3, writable, signer, name = "payer", desc = "The account paying for storage fees")]
    #[account(4, writable, name = "pool_token_account", desc = "The pool's associated token account")]
    #[account(5, name = "token_program", desc = "The SPL Token program")]
    #[account(6, name = "associated_token_program", desc = "The Associated Token Program")]
    #[account(7, name = "system_program", desc = "The system program")]
    InitializePoolV1(InitializePoolV1Args),

    /// Create a new stake.
    /// Stakes tokens into the pool as a specific staker type.
    #[account(0, writable, name = "pool", desc = "The staking pool account")]
    #[account(1, writable, name = "stake_account", desc = "The stake account to create")]
    #[account(2, writable, signer, name = "staker", desc = "The staker")]
    #[account(3, writable, name = "staker_token_account", desc = "The staker's token account")]
    #[account(4, writable, name = "vault", desc = "The pool's vault token account")]
    #[account(5, writable, signer, name = "payer", desc = "The account paying for storage fees")]
    #[account(6, name = "token_program", desc = "The SPL Token program")]
    #[account(7, name = "system_program", desc = "The system program")]
    CreateStakeV1(CreateStakeV1Args),

    /// Unstake tokens.
    /// Removes staked tokens from the pool (respects lockup periods).
    #[account(0, writable, name = "pool", desc = "The staking pool account")]
    #[account(1, writable, name = "stake_account", desc = "The stake account")]
    #[account(2, signer, name = "staker", desc = "The staker")]
    #[account(3, writable, name = "staker_token_account", desc = "The staker's token account")]
    #[account(4, writable, name = "vault", desc = "The pool's vault token account")]
    #[account(5, name = "vault_authority", desc = "The vault authority PDA")]
    #[account(6, name = "token_program", desc = "The SPL Token program")]
    UnstakeV1(UnstakeV1Args),

    /// Claim accumulated rewards.
    /// Claims pending rewards for a stake account.
    #[account(0, writable, name = "pool", desc = "The staking pool account")]
    #[account(1, writable, name = "stake_account", desc = "The stake account")]
    #[account(2, signer, name = "staker", desc = "The staker")]
    #[account(3, writable, name = "staker_token_account", desc = "The staker's token account")]
    #[account(4, writable, name = "vault", desc = "The pool's vault token account")]
    #[account(5, name = "vault_authority", desc = "The vault authority PDA")]
    #[account(6, name = "token_program", desc = "The SPL Token program")]
    ClaimRewardsV1(ClaimRewardsV1Args),

    /// Update pool configuration.
    /// Updates reward rates, lockup periods, and other pool settings.
    #[account(0, writable, name = "pool", desc = "The staking pool account")]
    #[account(1, signer, name = "authority", desc = "The authority of the pool")]
    UpdatePoolV1(UpdatePoolV1Args),

    /// Slash a stake.
    /// Admin instruction to slash tokens from a stake (for violations).
    #[account(0, writable, name = "pool", desc = "The staking pool account")]
    #[account(1, writable, name = "stake_account", desc = "The stake account to slash")]
    #[account(2, signer, name = "authority", desc = "The authority of the pool")]
    #[account(3, writable, name = "vault", desc = "The pool's vault token account")]
    #[account(4, writable, name = "slash_destination", desc = "The destination for slashed tokens")]
    #[account(5, name = "vault_authority", desc = "The vault authority PDA")]
    #[account(6, name = "token_program", desc = "The SPL Token program")]
    SlashV1(SlashV1Args),
}
