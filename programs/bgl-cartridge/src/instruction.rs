use shank::{ShankContext, ShankInstruction};
use strum_macros::{EnumDiscriminants, FromRepr};

use crate::processor::{
    CommissionMachineV1Args, InsertCartridgeV1Args, PrintGameCartridgeV1Args, ReleaseGameV1Args,
    RemoveCartridgeV1Args,
};

#[derive(Clone, Debug, ShankContext, ShankInstruction, EnumDiscriminants)]
#[strum_discriminants(derive(FromRepr))]
#[rustfmt::skip]
pub enum BglCartridgeInstruction {
    /// Create a new machine.
    /// Creates a Core NFT in the provided collection to represent a new machine.
    #[account(0, writable, name = "machine", desc = "The new machine asset account")]
    #[account(1, writable, name = "machine_collection", desc = "The Core machine collection")]
    #[account(2, name = "owner", desc = "The owner of the machine")]
    #[account(3, writable, signer, name = "payer", desc = "The account paying for the storage fees")]
    #[account(4, optional, signer, name = "authority", desc = "The authority signing for account creation")]
    #[account(5, name = "mpl_core_program", desc = "The mpl core program")]
    #[account(6, name = "system_program", desc = "The system program")]
    CommissionMachineV1(CommissionMachineV1Args),

    /// Create a game.
    /// Create a Core collection to represent the game.
    /// The actual games will be represented by Core NFTs in the game collection.
    #[account(0, writable, name = "game", desc = "The new game Collection account")]
    #[account(1, writable, name = "game_token_account", desc = "The token account receiving the payment for the game")]
    #[account(2, writable, signer, name = "payer", desc = "The account paying for the storage fees")]
    #[account(3, optional, signer, name = "authority", desc = "The authority signing for account creation")]
    #[account(4, name = "payment_mint", desc = "The Mint address for the payment token")]
    #[account(5, name = "mpl_core_program", desc = "The mpl core program")]
    #[account(6, name = "token_program", desc = "The token program")]
    #[account(7, name = "associated_token_program", desc = "The associated token program")]
    #[account(8, name = "system_program", desc = "The system program")]
    ReleaseGameV1(ReleaseGameV1Args),

    /// Print a game cartridge.
    /// Print a Core NFT in the game collection to represent a new game cartridge.
    #[account(0, writable, signer, name = "cartridge", desc = "The new game asset account")]
    #[account(1, writable, name = "game", desc = "The game Collection account")]
    #[account(2, writable, name = "game_token_account", desc = "The token account receiving the payment for the game")]
    #[account(3, name = "owner", desc = "The owner of the game")]
    #[account(4, writable, signer, name = "payer", desc = "The account paying for the storage fees")]
    #[account(5, writable, name = "payer_token_account", desc = "The account paying for the storage fees and the game cost")]
    #[account(6, optional, signer, name = "authority", desc = "The authority signing for account creation")]
    #[account(7, writable, name = "payment_mint", desc = "The payment mint")]
    #[account(8, name = "mpl_core_program", desc = "The mpl core program")]
    #[account(9, name = "token_program", desc = "The token program")]
    #[account(10, name = "system_program", desc = "The system program")]
    PrintGameCartridgeV1(PrintGameCartridgeV1Args),

    /// Insert cartridge
    /// Insert a game cartridge into a machine.
    #[account(0, writable, name = "cartridge", desc = "The game cartridge account")]
    #[account(1, writable, name = "game", desc = "The game Collection account")]
    #[account(2, writable, signer, name = "cartridge_owner", desc = "The owner of the game cartridge")]
    #[account(3, writable, name = "machine", desc = "The machine asset account")]
    #[account(4, writable, name = "machine_collection", desc = "The Core machine collection")]
    #[account(5, name = "machine_owner", desc = "The owner of the machine")]
    #[account(6, name = "mpl_core_program", desc = "The mpl core program")]
    #[account(7, name = "system_program", desc = "The system program")]
    InsertCartridgeV1(InsertCartridgeV1Args),

    /// Remove cartridge
    /// Remove a game cartridge from a machine.
    #[account(0, writable, name = "cartridge", desc = "The game cartridge account")]
    #[account(1, writable, name = "game", desc = "The game Collection account")]
    #[account(2, writable, signer, name = "cartridge_owner", desc = "The owner of the game cartridge")]
    #[account(3, writable, name = "machine", desc = "The machine asset account")]
    #[account(4, writable, name = "machine_collection", desc = "The Core machine collection")]
    #[account(5, name = "machine_owner", desc = "The owner of the machine")]
    #[account(6, name = "mpl_core_program", desc = "The mpl core program")]
    #[account(7, name = "system_program", desc = "The system program")]
    RemoveCartridgeV1(RemoveCartridgeV1Args),
}
