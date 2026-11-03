use borsh::{BorshDeserialize, BorshSerialize};
use mpl_core::{
    accounts::BaseCollectionV1,
    fetch_external_plugin_adapter_data_info,
    types::{ExternalPluginAdapterKey, LinkedDataKey, PluginAuthority},
};
use mpl_utils::{assert_owned_by, cmp_pubkeys};
use shank::ShankType;
use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    program_error::ProgramError,
    pubkey::{pubkey, Pubkey},
};

use crate::error::BglCartridgeError;

pub const MACHINE_PREFIX: &[u8] = b"machine";
pub const GAME_PREFIX: &[u8] = b"game";

pub const CRUMBS_MINT: Pubkey = pubkey!("BQDMYwgnWr9UBcUCvLX67yXriTVe1bkPEiTQ1TzKpump");
pub const USDC_MINT: Pubkey = pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

/// Serialized size of `GameCollectionData` v0 (no payment mint, always CRUMBS).
pub const GAME_DATA_V0_LEN: usize = 42;
/// Serialized size of `GameCollectionData` v1.
pub const GAME_DATA_V1_LEN: usize = 74;

// Source attestation authority. Only this account can call set_cartridge_source
// to upgrade a cartridge's recorded source from Unknown to Crypto/Stripe.
pub const SOURCE_AUTHORITY: Pubkey = pubkey!("src2kPC5JrxFrK8hHgqDMGiAMhDp7Sdbxj8NGjee4j9");

pub const LOCALNET_AUTHORITY: Pubkey = pubkey!("2gy9s5sUQY3icPwF5y1koz1UNkQW5EdAQxLm4BxiePM5");

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Eq, Debug, Copy, Clone, ShankType)]
pub struct GameCollectionData {
    pub version: u8,
    #[idl_type(PriceType)]
    pub price_type: u8,
    /// Price in base units of `payment_mint`.
    pub price: u64,
    pub publisher: Pubkey,
    /// CRUMBS_MINT or USDC_MINT. v0 records have no field and mean CRUMBS.
    pub payment_mint: Pubkey,
}

impl GameCollectionData {
    /// Decodes either layout. A v0 record reads as `payment_mint = CRUMBS_MINT`.
    pub fn load(bytes: &[u8]) -> Result<Self, ProgramError> {
        match bytes.len() {
            GAME_DATA_V0_LEN => {
                // v0 is v1 without the trailing mint. Parsed by hand so the
                // legacy layout never appears in the IDL (shank would pick up a
                // borsh struct).
                if bytes[0] != 0 {
                    return Err(BglCartridgeError::InvalidGameData.into());
                }
                let price = u64::from_le_bytes(
                    bytes[2..10]
                        .try_into()
                        .map_err(|_| BglCartridgeError::InvalidGameData)?,
                );
                let publisher = Pubkey::try_from(&bytes[10..42])
                    .map_err(|_| BglCartridgeError::InvalidGameData)?;
                Ok(Self {
                    version: 0,
                    price_type: bytes[1],
                    price,
                    publisher,
                    payment_mint: CRUMBS_MINT,
                })
            }
            GAME_DATA_V1_LEN => {
                let data =
                    Self::try_from_slice(bytes).map_err(|_| BglCartridgeError::InvalidGameData)?;
                if data.version != 1 {
                    return Err(BglCartridgeError::InvalidGameData.into());
                }
                Ok(data)
            }
            _ => Err(BglCartridgeError::InvalidGameData.into()),
        }
    }
}

/// Reads the game's `GameCollectionData` from its LinkedAppData. The game must
/// be a Core collection; the caller still verifies the PDA where it matters.
pub fn read_game_data(game: &AccountInfo) -> Result<GameCollectionData, ProgramError> {
    assert_owned_by(
        game,
        &mpl_core::ID,
        BglCartridgeError::InvalidGamePdaDerivation,
    )?;
    let (offset, length) = fetch_external_plugin_adapter_data_info::<BaseCollectionV1>(
        game,
        None,
        &ExternalPluginAdapterKey::DataSection(LinkedDataKey::LinkedAppData(
            PluginAuthority::UpdateAuthority,
        )),
    )?;
    GameCollectionData::load(&game.try_borrow_data()?[offset..offset + length])
}

/// Only CRUMBS and USDC are accepted, and USDC can only be transferred.
pub fn validate_payment(mint: &Pubkey, price_type: PriceType) -> ProgramResult {
    let is_usdc = cmp_pubkeys(mint, &USDC_MINT);
    if !is_usdc && !cmp_pubkeys(mint, &CRUMBS_MINT) {
        return Err(BglCartridgeError::InvalidPaymentMint.into());
    }
    if is_usdc && price_type == PriceType::Burn {
        return Err(BglCartridgeError::BurnNotAllowedForMint.into());
    }
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    fn v0_bytes(price_type: u8, price: u64, publisher: Pubkey) -> Vec<u8> {
        let mut out = vec![0u8, price_type];
        out.extend_from_slice(&price.to_le_bytes());
        out.extend_from_slice(publisher.as_ref());
        out
    }

    #[test]
    fn v0_data_reads_as_crumbs() {
        let publisher = Pubkey::new_unique();
        let bytes = v0_bytes(PriceType::Burn as u8, 50_000_000_000, publisher);
        assert_eq!(bytes.len(), GAME_DATA_V0_LEN);
        let data = GameCollectionData::load(&bytes).unwrap();
        assert_eq!(data.version, 0);
        assert_eq!(data.price, 50_000_000_000);
        assert_eq!(data.publisher, publisher);
        assert_eq!(data.payment_mint, CRUMBS_MINT);
    }

    #[test]
    fn v1_data_round_trips() {
        let data = GameCollectionData {
            version: 1,
            price_type: PriceType::Transfer as u8,
            price: 2_990_000,
            publisher: Pubkey::new_unique(),
            payment_mint: USDC_MINT,
        };
        let bytes = borsh::to_vec(&data).unwrap();
        assert_eq!(bytes.len(), GAME_DATA_V1_LEN);
        assert_eq!(GameCollectionData::load(&bytes).unwrap(), data);
    }

    #[test]
    fn unknown_layouts_are_rejected() {
        let mut v1 = borsh::to_vec(&GameCollectionData {
            version: 1,
            price_type: 0,
            price: 1,
            publisher: Pubkey::new_unique(),
            payment_mint: USDC_MINT,
        })
        .unwrap();
        v1[0] = 2;
        assert!(GameCollectionData::load(&v1).is_err());
        assert!(GameCollectionData::load(&[0u8; 10]).is_err());
        let mut v0 = v0_bytes(0, 1, Pubkey::new_unique());
        v0[0] = 1;
        assert!(GameCollectionData::load(&v0).is_err());
    }

    #[test]
    fn payment_rules() {
        assert!(validate_payment(&CRUMBS_MINT, PriceType::Burn).is_ok());
        assert!(validate_payment(&CRUMBS_MINT, PriceType::Transfer).is_ok());
        assert!(validate_payment(&USDC_MINT, PriceType::Transfer).is_ok());
        assert_eq!(
            validate_payment(&USDC_MINT, PriceType::Burn),
            Err(BglCartridgeError::BurnNotAllowedForMint.into())
        );
        assert_eq!(
            validate_payment(&Pubkey::new_unique(), PriceType::Transfer),
            Err(BglCartridgeError::InvalidPaymentMint.into())
        );
    }
}
