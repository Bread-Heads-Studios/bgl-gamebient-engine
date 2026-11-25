use shank::{ShankContext, ShankInstruction};
use strum_macros::{EnumDiscriminants, FromRepr};

use crate::processor::{
    CommissionMachineV1Args, CommissionMachineV2Args, InsertCartridgeV1Args, InsertCartridgeV2Args,
    PrintGameCartridgeV1Args, PrintLookV1Args, RegisterLookV1Args, ReleaseGameV1Args,
    RemoveCartridgeV1Args, RemoveCartridgeV2Args, SetCartridgeSourceV1Args,
    SetMachineOperatorV1Args, UpdateGamePriceV1Args, UpdateLookV1Args,
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

    /// Insert cartridge (retired).
    /// Always fails with InstructionRetired. Use InsertCartridgeV2.
    #[account(0, writable, name = "cartridge", desc = "The game cartridge account")]
    #[account(1, writable, name = "game", desc = "The game Collection account")]
    #[account(2, writable, signer, name = "cartridge_owner", desc = "The owner of the game cartridge")]
    #[account(3, writable, name = "machine", desc = "The machine asset account")]
    #[account(4, writable, name = "machine_collection", desc = "The Core machine collection")]
    #[account(5, name = "machine_owner", desc = "The owner of the machine")]
    #[account(6, name = "mpl_core_program", desc = "The mpl core program")]
    #[account(7, name = "system_program", desc = "The system program")]
    InsertCartridgeV1(InsertCartridgeV1Args),

    /// Remove cartridge (retired).
    /// Always fails with InstructionRetired. Use RemoveCartridgeV2.
    #[account(0, writable, name = "cartridge", desc = "The game cartridge account")]
    #[account(1, writable, name = "game", desc = "The game Collection account")]
    #[account(2, writable, signer, name = "cartridge_owner", desc = "The owner of the game cartridge")]
    #[account(3, writable, name = "machine", desc = "The machine asset account")]
    #[account(4, writable, name = "machine_collection", desc = "The Core machine collection")]
    #[account(5, name = "machine_owner", desc = "The owner of the machine")]
    #[account(6, name = "mpl_core_program", desc = "The mpl core program")]
    #[account(7, name = "system_program", desc = "The system program")]
    RemoveCartridgeV1(RemoveCartridgeV1Args),

    /// Set cartridge source.
    /// Records the AML payment source on a cartridge. Write-once: the cartridge's
    /// stored source must be Unknown (the default after print). Only callable by
    /// the configured AML_AUTHORITY signer.
    #[account(0, writable, name = "cartridge", desc = "The game cartridge asset account")]
    #[account(1, writable, name = "game", desc = "The game Collection account the cartridge belongs to")]
    #[account(2, signer, name = "authority", desc = "The AML authority signing the attestation")]
    #[account(3, writable, signer, name = "payer", desc = "The account paying for the storage fees")]
    #[account(4, name = "mpl_core_program", desc = "The mpl core program")]
    #[account(5, name = "system_program", desc = "The system program")]
    SetCartridgeSourceV1(SetCartridgeSourceV1Args),

    /// Update game price.
    /// Changes the price and payment type (transfer or burn) of a game.
    /// Only callable by the game's publisher. Cartridges printed afterwards
    /// pay the new price.
    #[account(0, writable, name = "game", desc = "The game Collection account")]
    #[account(1, signer, name = "authority", desc = "The publisher of the game")]
    #[account(2, writable, signer, name = "payer", desc = "The account paying for the storage fees")]
    #[account(3, name = "mpl_core_program", desc = "The mpl core program")]
    #[account(4, name = "system_program", desc = "The system program")]
    UpdateGamePriceV1(UpdateGamePriceV1Args),

    /// Register a look.
    /// Creates a Core collection at the look PDA to represent a look product
    /// for a game, and writes its LookData.
    #[account(0, writable, name = "look", desc = "The new look Collection account, PDA of game, creator and look id")]
    #[account(1, name = "game", desc = "The game Collection account")]
    #[account(2, signer, name = "creator", desc = "The creator of the look")]
    #[account(3, writable, signer, name = "payer", desc = "The account paying for the storage fees")]
    #[account(4, name = "payment_mint", desc = "The Mint address for the payment token")]
    #[account(5, name = "mpl_core_program", desc = "The mpl core program")]
    #[account(6, name = "system_program", desc = "The system program")]
    RegisterLookV1(RegisterLookV1Args),

    /// Update a look.
    /// Changes the look's uri, content hash and/or price and bumps its version. Creator only.
    #[account(0, writable, name = "look", desc = "The look Collection account")]
    #[account(1, signer, name = "creator", desc = "The creator of the look")]
    #[account(2, writable, signer, name = "payer", desc = "The account paying for the storage fees")]
    #[account(3, name = "mpl_core_program", desc = "The mpl core program")]
    #[account(4, name = "system_program", desc = "The system program")]
    UpdateLookV1(UpdateLookV1Args),

    /// Print a look.
    /// Mints a frozen Edition copy of the look into the cartridge's asset signer.
    /// The cartridge owner co-signs; the payer pays the look's creator or burns.
    #[account(0, writable, signer, name = "copy", desc = "The new look copy asset account")]
    #[account(1, writable, name = "look", desc = "The look Collection account")]
    #[account(2, name = "cartridge", desc = "The game cartridge asset the look is printed for")]
    #[account(3, signer, name = "owner", desc = "The owner of the cartridge")]
    #[account(4, name = "recipient", desc = "The cartridge's asset signer PDA, owner of the copy")]
    #[account(5, writable, name = "creator_token_account", desc = "The look creator's token account receiving a transfer payment")]
    #[account(6, writable, signer, name = "payer", desc = "The account paying for the storage fees and the look cost")]
    #[account(7, writable, name = "payer_token_account", desc = "The payer's token account paying the look cost")]
    #[account(8, writable, name = "payment_mint", desc = "The payment mint")]
    #[account(9, name = "mpl_core_program", desc = "The mpl core program")]
    #[account(10, name = "token_program", desc = "The token program")]
    #[account(11, name = "system_program", desc = "The system program")]
    PrintLookV1(PrintLookV1Args),

    /// Commission a machine with an operator.
    /// As CommissionMachineV1, and also records the machine's operator (the
    /// cabinet's device key) in its MachineData. The owner does not sign.
    #[account(0, writable, name = "machine", desc = "The new machine asset account")]
    #[account(1, writable, name = "machine_collection", desc = "The Core machine collection")]
    #[account(2, name = "owner", desc = "The owner of the machine")]
    #[account(3, writable, signer, name = "payer", desc = "The account paying for the storage fees")]
    #[account(4, optional, signer, name = "authority", desc = "The machine collection's update authority")]
    #[account(5, name = "mpl_core_program", desc = "The mpl core program")]
    #[account(6, name = "system_program", desc = "The system program")]
    CommissionMachineV2(CommissionMachineV2Args),

    /// Set machine operator.
    /// Replaces the operator key in the machine's MachineData. The all-zero
    /// key revokes the operator. Only callable by the machine's owner.
    #[account(0, writable, name = "machine", desc = "The machine asset account")]
    #[account(1, writable, name = "machine_collection", desc = "The Core machine collection")]
    #[account(2, signer, name = "owner", desc = "The owner of the machine")]
    #[account(3, writable, signer, name = "payer", desc = "The account paying for the storage fees")]
    #[account(4, name = "mpl_core_program", desc = "The mpl core program")]
    #[account(5, name = "system_program", desc = "The system program")]
    SetMachineOperatorV1(SetMachineOperatorV1Args),

    /// Insert cartridge.
    /// Writes the machine's address into the cartridge's link slot. The signer
    /// must own both the cartridge and the machine, and the slot must be empty.
    #[account(0, writable, name = "cartridge", desc = "The game cartridge asset account")]
    #[account(1, writable, name = "game", desc = "The game Collection account")]
    #[account(2, signer, name = "owner", desc = "The owner of both the cartridge and the machine")]
    #[account(3, name = "machine", desc = "The machine asset account")]
    #[account(4, name = "machine_collection", desc = "The Core machine collection")]
    #[account(5, writable, signer, name = "payer", desc = "The account paying for the storage fees")]
    #[account(6, name = "mpl_core_program", desc = "The mpl core program")]
    #[account(7, name = "system_program", desc = "The system program")]
    InsertCartridgeV2(InsertCartridgeV2Args),

    /// Remove cartridge.
    /// Clears the cartridge's link slot. Only callable by the cartridge's owner.
    #[account(0, writable, name = "cartridge", desc = "The game cartridge asset account")]
    #[account(1, writable, name = "game", desc = "The game Collection account")]
    #[account(2, signer, name = "cartridge_owner", desc = "The owner of the game cartridge")]
    #[account(3, writable, signer, name = "payer", desc = "The account paying for the storage fees")]
    #[account(4, name = "mpl_core_program", desc = "The mpl core program")]
    #[account(5, name = "system_program", desc = "The system program")]
    RemoveCartridgeV2(RemoveCartridgeV2Args),
}
