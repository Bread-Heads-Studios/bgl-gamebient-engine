use shank::ShankInstruction;
use strum_macros::{EnumDiscriminants, FromRepr};

use crate::processor::{CreateGhostV1Args, ExpireGhostV1Args, UseGhostV1Args};

#[derive(Clone, Debug, ShankInstruction, EnumDiscriminants)]
#[strum_discriminants(derive(FromRepr))]
#[rustfmt::skip]
pub enum BglGhostInstruction {
    /// Create a ghost.
    /// Creates a Core NFT to represent a ghost (high score/play data) for a game.
    #[accounts(CreateGhostV1Accounts)]
    CreateGhostV1(CreateGhostV1Args),

    /// Use a ghost.
    /// Uses a ghost in asynchronous multiplayer gameplay.
    /// May trigger a payout to the ghost owner if configured.
    #[accounts(UseGhostV1Accounts)]
    UseGhostV1(UseGhostV1Args),

    /// Expire a ghost.
    /// Burns a ghost NFT if it's no longer valid or has expired.
    #[accounts(ExpireGhostV1Accounts)]
    ExpireGhostV1(ExpireGhostV1Args),
}
