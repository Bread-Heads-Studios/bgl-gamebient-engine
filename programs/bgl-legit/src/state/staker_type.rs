use bytemuck::{Pod, Zeroable};
use shank::ShankType;

/// The type of staker
#[repr(u8)]
#[derive(Copy, Clone, Debug, PartialEq, Eq, ShankType)]
pub enum StakerType {
    /// Machine owner staker type
    MachineOwner = 0,
    /// Game creator staker type
    GameCreator = 1,
}

// Manual implementation of Pod and Zeroable for StakerType
// since enums can't automatically derive Pod
unsafe impl Pod for StakerType {}
unsafe impl Zeroable for StakerType {}
