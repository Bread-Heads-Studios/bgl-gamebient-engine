use borsh::{BorshDeserialize, BorshSerialize};
use bytemuck::{Pod, Zeroable};
use shank::ShankType;
use solana_program::pubkey::{pubkey, Pubkey};

pub const MACHINE_PREFIX: &[u8] = b"machine";
pub const GAME_PREFIX: &[u8] = b"game";

pub const PAYMENT_TOKEN_MINT: Pubkey = pubkey!("BQDMYwgnWr9UBcUCvLX67yXriTVe1bkPEiTQ1TzKpump");

// Source attestation authority. Only this account can call set_cartridge_source
// to upgrade a cartridge's recorded source from Unknown to Crypto/Stripe.
pub const SOURCE_AUTHORITY: Pubkey = pubkey!("srcwh9Q87zK1DxeMmbDDesFxvFSNCN35rGrSkCrZkhk");

pub const LOCALNET_AUTHORITY: Pubkey = pubkey!("2gy9s5sUQY3icPwF5y1koz1UNkQW5EdAQxLm4BxiePM5");

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

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Eq, Debug, Copy, Clone, ShankType)]
pub struct CartridgeData {
    pub version: u8,
    #[idl_type(Source)]
    pub source: u8,
}

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Eq, Debug, Copy, Clone, ShankType)]
pub enum Source {
    Unknown,
    Crypto,
    Stripe,
}

impl From<u8> for Source {
    fn from(value: u8) -> Self {
        match value {
            0 => Source::Unknown,
            1 => Source::Crypto,
            2 => Source::Stripe,
            _ => panic!("Invalid source"),
        }
    }
}
