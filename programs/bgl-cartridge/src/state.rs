use borsh::{BorshDeserialize, BorshSerialize};
use bytemuck::{Pod, Zeroable};
use shank::ShankType;
use solana_program::{
    program_error::ProgramError,
    pubkey::{pubkey, Pubkey},
};

use crate::error::BglCartridgeError;

pub const MACHINE_PREFIX: &[u8] = b"machine";
pub const GAME_PREFIX: &[u8] = b"game";

pub const PAYMENT_TOKEN_MINT: Pubkey = pubkey!("BQDMYwgnWr9UBcUCvLX67yXriTVe1bkPEiTQ1TzKpump");

// Source attestation authority. Only this account can call set_cartridge_source
// to upgrade a cartridge's recorded source from Unknown to Crypto/Stripe.
pub const SOURCE_AUTHORITY: Pubkey = pubkey!("srcwh9Q87zK1DxeMmbDDesFxvFSNCN35rGrSkCrZkhk");

pub const LOCALNET_AUTHORITY: Pubkey = pubkey!("2gy9s5sUQY3icPwF5y1koz1UNkQW5EdAQxLm4BxiePM5");

// USDC, the stable alternative to the payment token. A game that sets a
// USDC price can be bought with either currency.
pub const USDC_MINT: Pubkey = pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

// Stand-in USDC mint for localnet tests (clients/js-cartridge/test/fixtures/
// usdc-mint.json). Accepted only while the cluster is in epoch zero.
pub const LOCALNET_USDC_MINT: Pubkey = pubkey!("CKmDJxVA4jUKHbEw2NX77RcY49nb87SEoBdUHzR7hjYE");

/// The USDC mint this cluster accepts: mainnet USDC, or the localnet
/// stand-in while the cluster is in epoch zero.
pub fn is_usdc_mint(key: &Pubkey, epoch: u64) -> bool {
    key == &USDC_MINT || (epoch == 0 && key == &LOCALNET_USDC_MINT)
}

/// Game data as written by releases before USDC pricing (version 0).
/// Kept so existing collections keep deserializing; new writes use
/// `GameCollectionDataV1`.
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Eq, Debug, Copy, Clone, ShankType)]
pub struct GameCollectionData {
    pub version: u8,
    #[idl_type(PriceType)]
    pub price_type: u8,
    pub price: u64,
    pub publisher: Pubkey,
}

/// Game data, version 1: adds an optional USDC price. `usdc_price` is in
/// USDC base units (6 decimals); zero means the game cannot be bought with
/// USDC. The payment-token price keeps its `price_type` (Transfer or Burn);
/// USDC is always transferred to the game's USDC token account.
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Eq, Debug, Copy, Clone, ShankType)]
pub struct GameCollectionDataV1 {
    pub version: u8,
    #[idl_type(PriceType)]
    pub price_type: u8,
    pub price: u64,
    pub publisher: Pubkey,
    pub usdc_price: u64,
}

impl GameCollectionDataV1 {
    pub const VERSION: u8 = 1;

    /// Reads any stored version of the game data, upgrading version 0 in
    /// memory (no USDC price).
    pub fn load(bytes: &[u8]) -> Result<Self, ProgramError> {
        match bytes.first() {
            Some(0) => {
                let v0 = GameCollectionData::try_from_slice(bytes)?;
                Ok(Self {
                    version: 0,
                    price_type: v0.price_type,
                    price: v0.price,
                    publisher: v0.publisher,
                    usdc_price: 0,
                })
            }
            Some(1) => Ok(Self::try_from_slice(bytes)?),
            _ => Err(BglCartridgeError::InvalidGameDataVersion.into()),
        }
    }

    pub fn accepts_usdc(&self) -> bool {
        self.usdc_price > 0
    }
}

/// The currency a cartridge is paid for in.
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Eq, Debug, Copy, Clone, ShankType)]
pub enum Currency {
    Crumbs,
    Usdc,
}

impl TryFrom<u8> for Currency {
    type Error = ProgramError;

    fn try_from(value: u8) -> Result<Self, ProgramError> {
        match value {
            0 => Ok(Currency::Crumbs),
            1 => Ok(Currency::Usdc),
            _ => Err(BglCartridgeError::InvalidCurrency.into()),
        }
    }
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
