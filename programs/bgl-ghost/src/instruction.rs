use shank::{ShankContext, ShankInstruction};
use strum_macros::{EnumDiscriminants, FromRepr};

use crate::processor::{
    ClaimCrownV1Args, CreateCrownV1Args, ReassignCrownV1Args, UpdateCrownV1Args,
};

#[derive(Clone, Debug, ShankContext, ShankInstruction, EnumDiscriminants)]
#[strum_discriminants(derive(FromRepr))]
#[rustfmt::skip]
pub enum BglGhostInstruction {
    /// Create a crown.
    /// Creates the high-score crown for one game season: a frozen Core asset only this program can
    /// move, a reward vault owned by the crown, and a pot owned by the asset's signer PDA.
    #[account(0, writable, name = "crown", desc = "The crown PDA")]
    #[account(1, writable, name = "asset", desc = "The crown Core asset PDA")]
    #[account(2, name = "asset_signer", desc = "The crown asset's signer PDA (mpl-core execute)")]
    #[account(3, name = "game", desc = "The game this crown belongs to")]
    #[account(4, name = "reward_mint", desc = "The mint rewards are paid in")]
    #[account(5, writable, name = "vault", desc = "The crown's reward vault (ATA of the crown)")]
    #[account(6, writable, name = "pot", desc = "The crown's pot (ATA of the asset signer)")]
    #[account(7, signer, name = "authority", desc = "The crown authority")]
    #[account(8, name = "attestor", desc = "The backend key that co-signs score submissions")]
    #[account(9, writable, signer, name = "payer", desc = "The account paying for storage fees")]
    #[account(10, name = "mpl_core_program", desc = "The mpl core program")]
    #[account(11, name = "token_program", desc = "The SPL Token program")]
    #[account(12, name = "associated_token_program", desc = "The Associated Token program")]
    #[account(13, name = "system_program", desc = "The system program")]
    CreateCrownV1(CreateCrownV1Args),

    /// Claim a crown.
    /// Records a verified score that beats the current high score. If the player isn't the current
    /// holder, the crown (and its pot) moves to them and the capture bounty is paid into the pot.
    #[account(0, writable, name = "crown", desc = "The crown PDA")]
    #[account(1, writable, name = "asset", desc = "The crown Core asset")]
    #[account(2, name = "new_holder", desc = "The player who set the score")]
    #[account(3, writable, name = "vault", desc = "The crown's reward vault")]
    #[account(4, writable, name = "pot", desc = "A clean token account owned by the asset signer")]
    #[account(5, signer, name = "attestor", desc = "The backend key that verified the play")]
    #[account(6, writable, signer, name = "payer", desc = "The account paying for fees")]
    #[account(7, name = "mpl_core_program", desc = "The mpl core program")]
    #[account(8, name = "token_program", desc = "The SPL Token program")]
    #[account(9, name = "system_program", desc = "The system program")]
    ClaimCrownV1(ClaimCrownV1Args),

    /// Accrue crown rewards.
    /// Permissionless. Pays the time-held reward owed so far from the vault into the pot.
    #[account(0, writable, name = "crown", desc = "The crown PDA")]
    #[account(1, writable, name = "vault", desc = "The crown's reward vault")]
    #[account(2, writable, name = "pot", desc = "A clean token account owned by the asset signer")]
    #[account(3, name = "token_program", desc = "The SPL Token program")]
    AccrueCrownV1,

    /// Update a crown.
    /// Rotates the attestor and/or changes reward settings, paying accrual owed so far first.
    #[account(0, writable, name = "crown", desc = "The crown PDA")]
    #[account(1, signer, name = "authority", desc = "The crown authority")]
    #[account(2, writable, name = "vault", desc = "The crown's reward vault")]
    #[account(3, writable, name = "pot", desc = "A clean token account owned by the asset signer")]
    #[account(4, name = "token_program", desc = "The SPL Token program")]
    UpdateCrownV1(UpdateCrownV1Args),

    /// End a crown season.
    /// Pays the final accrual, returns the rest of the vault and stops further claims.
    #[account(0, writable, name = "crown", desc = "The crown PDA")]
    #[account(1, signer, name = "authority", desc = "The crown authority")]
    #[account(2, writable, name = "vault", desc = "The crown's reward vault")]
    #[account(3, writable, name = "pot", desc = "A clean token account owned by the asset signer")]
    #[account(4, writable, name = "destination", desc = "Receives the remaining vault balance")]
    #[account(5, name = "token_program", desc = "The SPL Token program")]
    EndCrownSeasonV1,

    /// Reassign a crown.
    /// Authority override for a fraudulent score: moves the crown (and its pot) to a new holder,
    /// or back to the crown PDA to leave it unclaimed, and sets the score to beat. Works on ended
    /// seasons too.
    #[account(0, writable, name = "crown", desc = "The crown PDA")]
    #[account(1, writable, name = "asset", desc = "The crown Core asset")]
    #[account(2, name = "new_holder", desc = "The rightful holder, or the crown PDA to leave it unclaimed")]
    #[account(3, writable, name = "vault", desc = "The crown's reward vault")]
    #[account(4, writable, name = "pot", desc = "A clean token account owned by the asset signer")]
    #[account(5, signer, name = "authority", desc = "The crown authority")]
    #[account(6, writable, signer, name = "payer", desc = "The account paying for fees")]
    #[account(7, name = "mpl_core_program", desc = "The mpl core program")]
    #[account(8, name = "token_program", desc = "The SPL Token program")]
    #[account(9, name = "system_program", desc = "The system program")]
    ReassignCrownV1(ReassignCrownV1Args),
}
