use shank::ShankInstruction;
use strum_macros::{EnumDiscriminants, FromRepr};

use crate::processor::{CreateGhostV1Args, ExpireGhostV1Args, UseGhostV1Args};

#[derive(Clone, Debug, ShankInstruction, EnumDiscriminants)]
#[strum_discriminants(derive(FromRepr))]
#[rustfmt::skip]
pub enum BglGhostInstruction {
    /// Create a ghost.
    /// Creates a Core NFT to represent a ghost (high score/play data) for a game.
    #[account(0, writable, name = "ghost", desc = "The new ghost asset account")]
    #[account(1, writable, name = "ghost_collection", desc = "The Core ghost collection (if using collections)")]
    #[account(2, name = "owner", desc = "The owner of the ghost (player who created the high score)")]
    #[account(3, writable, signer, name = "payer", desc = "The account paying for the storage fees")]
    #[account(4, optional, signer, name = "authority", desc = "The authority signing for account creation")]
    #[account(5, name = "mpl_core_program", desc = "The mpl core program")]
    #[account(6, name = "system_program", desc = "The system program")]
    CreateGhostV1(CreateGhostV1Args),

    /// Use a ghost.
    /// Uses a ghost in asynchronous multiplayer gameplay.
    /// May trigger a payout to the ghost owner if configured.
    #[account(0, writable, name = "ghost", desc = "The ghost asset being used")]
    #[account(1, writable, name = "ghost_owner", desc = "The ghost owner (receives payout if enabled)")]
    #[account(2, writable, signer, name = "player", desc = "The player using the ghost (pays for usage if required)")]
    #[account(3, name = "mpl_core_program", desc = "The mpl core program")]
    #[account(4, name = "system_program", desc = "The system program")]
    UseGhostV1(UseGhostV1Args),

    /// Expire a ghost.
    /// Burns a ghost NFT if it's no longer valid or has expired.
    #[account(0, writable, name = "ghost", desc = "The ghost asset to expire/burn")]
    #[account(1, optional, writable, name = "ghost_collection", desc = "The ghost collection (if part of a collection)")]
    #[account(2, writable, signer, name = "authority", desc = "The authority that can expire the ghost")]
    #[account(3, name = "mpl_core_program", desc = "The mpl core program")]
    #[account(4, name = "system_program", desc = "The system program")]
    ExpireGhostV1(ExpireGhostV1Args),
}
