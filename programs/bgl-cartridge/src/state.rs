use bytemuck::{Pod, Zeroable};
use shank::ShankType;

pub const MACHINE_PREFIX: &[u8] = b"machine";
pub const GAME_PREFIX: &[u8] = b"game";

#[repr(C)]
#[derive(Pod, Zeroable, PartialEq, Eq, Debug, Copy, Clone, ShankType)]
pub struct GameCollectionData {
    pub version: u8,
    pub padding: [u8; 7],
    pub price: u64,
}
