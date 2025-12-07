use borsh::{BorshDeserialize, BorshSerialize};
use bytemuck::{Pod, Zeroable};
use shank::ShankType;
use solana_program::pubkey::{pubkey, Pubkey};

pub const MACHINE_PREFIX: &[u8] = b"machine";
pub const GAME_PREFIX: &[u8] = b"game";

pub const PAYMENT_TOKEN_MINT: Pubkey = pubkey!("BQDMYwgnWr9UBcUCvLX67yXriTVe1bkPEiTQ1TzKpump");

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Eq, Debug, Copy, Clone, ShankType)]
pub struct GameCollectionData {
    pub version: u8,
    #[idl_type(PriceType)]
    pub price_type: u8,
    pub price: u64,
    pub publisher: Pubkey,
}

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Eq, Debug, Copy, Clone, ShankType)]
pub enum PriceType {
    Transfer,
    Burn,
}

impl From<u8> for PriceType {
    fn from(value: u8) -> Self {
        match value {
            0 => PriceType::Transfer,
            1 => PriceType::Burn,
            _ => panic!("Invalid price type"),
        }
    }
}
