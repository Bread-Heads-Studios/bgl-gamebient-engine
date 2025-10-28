use shank::ShankInstruction;
use strum_macros::{EnumDiscriminants, FromRepr};

use crate::processor::{
    CommissionMachineV1Args, InsertCartridgeV1Args, PrintGameCartridgeV1Args, ReleaseGameV1Args,
    RemoveCartridgeV1Args,
};

#[derive(Clone, Debug, ShankInstruction, EnumDiscriminants)]
#[strum_discriminants(derive(FromRepr))]
#[rustfmt::skip]
pub enum BglCartridgeInstruction {
    /// Create a new machine.
    /// Creates a Core NFT in the provided collection to represent a new machine.
    #[accounts(CommissionMachineV1Accounts)]
    CommissionMachineV1(CommissionMachineV1Args),

    /// Create a game.
    /// Create a Core collection to represent the game.
    /// The actual games will be represented by Core NFTs in the game collection.
    #[accounts(ReleaseGameV1Accounts)]
    ReleaseGameV1(ReleaseGameV1Args),

    /// Print a game cartridge.
    /// Print a Core NFT in the game collection to represent a new game cartridge.
    #[accounts(PrintGameCartridgeV1Accounts)]
    PrintGameCartridgeV1(PrintGameCartridgeV1Args),

    /// Insert cartridge
    /// Insert a game cartridge into a machine.
    #[accounts(InsertCartridgeV1Accounts)]
    InsertCartridgeV1(InsertCartridgeV1Args),

    /// Remove cartridge
    /// Remove a game cartridge from a machine.
    #[accounts(RemoveCartridgeV1Accounts)]
    RemoveCartridgeV1(RemoveCartridgeV1Args),
}
