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
pub const LOOK_PREFIX: &[u8] = b"look";

pub const CRUMBS_MINT: Pubkey = pubkey!("BQDMYwgnWr9UBcUCvLX67yXriTVe1bkPEiTQ1TzKpump");
pub const USDC_MINT: Pubkey = pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

/// Serialized size of `GameCollectionData` v0 (no payment mint, always CRUMBS).
pub const GAME_DATA_V0_LEN: usize = 42;
/// Serialized size of `GameCollectionData` v1.
pub const GAME_DATA_V1_LEN: usize = 74;
/// Serialized size of `LookData` v1.
pub const LOOK_DATA_V1_LEN: usize = 147;

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
    assert_owned_by(game, &mpl_core::ID, BglCartridgeError::InvalidGameData)?;
    let (offset, length) = fetch_external_plugin_adapter_data_info::<BaseCollectionV1>(
        game,
        None,
        &ExternalPluginAdapterKey::DataSection(LinkedDataKey::LinkedAppData(
            PluginAuthority::UpdateAuthority,
        )),
    )?;
    GameCollectionData::load(&game.try_borrow_data()?[offset..offset + length])
}

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Eq, Debug, Copy, Clone, ShankType)]
pub struct LookData {
    pub version: u8,
    pub game: Pubkey,
    pub creator: Pubkey,
    #[idl_type(PriceType)]
    pub price_type: u8,
    /// Price in base units of `payment_mint`.
    pub price: u64,
    /// CRUMBS_MINT or USDC_MINT.
    pub payment_mint: Pubkey,
    pub content_hash: [u8; 32],
    pub look_version: u32,
    pub schema: u8,
    /// Must be 0 until revenue sharing is supported.
    pub publisher_bps: u16,
    /// Must be 0 until revenue sharing is supported.
    pub protocol_bps: u16,
}

impl LookData {
    /// Accepts only the v1 layout.
    pub fn load(bytes: &[u8]) -> Result<Self, ProgramError> {
        if bytes.len() != LOOK_DATA_V1_LEN {
            return Err(BglCartridgeError::InvalidLookData.into());
        }
        let data = Self::try_from_slice(bytes).map_err(|_| BglCartridgeError::InvalidLookData)?;
        if data.version != 1 {
            return Err(BglCartridgeError::InvalidLookData.into());
        }
        Ok(data)
    }
}

/// Reads the look's `LookData` from its LinkedAppData. The look must be a Core
/// collection; the caller still verifies the PDA where it matters.
pub fn read_look_data(look: &AccountInfo) -> Result<LookData, ProgramError> {
    assert_owned_by(look, &mpl_core::ID, BglCartridgeError::InvalidLookData)?;
    let (offset, length) = fetch_external_plugin_adapter_data_info::<BaseCollectionV1>(
        look,
        None,
        &ExternalPluginAdapterKey::DataSection(LinkedDataKey::LinkedAppData(
            PluginAuthority::UpdateAuthority,
        )),
    )?;
    LookData::load(&look.try_borrow_data()?[offset..offset + length])
}

/// Look ids are `[a-z0-9-]{1,32}`.
pub fn is_look_id(s: &str) -> bool {
    (1..=32).contains(&s.len())
        && s.bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// The mpl-core Execute asset signer PDA for `cartridge`.
pub fn find_asset_signer(cartridge: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"mpl-core-execute", cartridge.as_ref()], &mpl_core::ID).0
}

/// The look collection PDA for `game`, `creator` and `look_id`. The creator is a
/// seed so nobody can squat another creator's look id.
pub fn look_pda(game: &Pubkey, creator: &Pubkey, look_id: &str) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            LOOK_PREFIX,
            game.as_ref(),
            creator.as_ref(),
            look_id.as_bytes(),
        ],
        &crate::ID,
    )
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
        assert_eq!(data.price_type, PriceType::Burn as u8);
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

    fn sample_look() -> LookData {
        LookData {
            version: 1,
            game: Pubkey::new_unique(),
            creator: Pubkey::new_unique(),
            price_type: PriceType::Transfer as u8,
            price: 1_500_000,
            payment_mint: USDC_MINT,
            content_hash: [7u8; 32],
            look_version: 3,
            schema: 1,
            publisher_bps: 0,
            protocol_bps: 0,
        }
    }

    #[test]
    fn look_data_round_trips() {
        let look = sample_look();
        let bytes = borsh::to_vec(&look).unwrap();
        assert_eq!(bytes.len(), LOOK_DATA_V1_LEN);
        assert_eq!(LookData::load(&bytes).unwrap(), look);
    }

    #[test]
    fn look_data_rejects_other_layouts() {
        let invalid: ProgramError = BglCartridgeError::InvalidLookData.into();
        let mut bytes = borsh::to_vec(&sample_look()).unwrap();
        assert_eq!(LookData::load(&bytes[..146]), Err(invalid.clone()));
        let mut long = bytes.clone();
        long.push(0);
        assert_eq!(LookData::load(&long), Err(invalid.clone()));
        bytes[0] = 2;
        assert_eq!(LookData::load(&bytes), Err(invalid));
    }

    #[test]
    fn look_id_rule() {
        for ok in ["fizzix", "fae-wilds", "a", &"a".repeat(32)] {
            assert!(is_look_id(ok), "{ok} should be valid");
        }
        for bad in [
            "",
            &"a".repeat(33),
            "Fizzix",
            "fizz_ix",
            "fizz ix",
            "fizz.ix",
        ] {
            assert!(!is_look_id(bad), "{bad} should be invalid");
        }
    }

    #[test]
    fn asset_signer_matches_mpl_core() {
        let k = Pubkey::new_unique();
        assert_eq!(
            find_asset_signer(&k),
            Pubkey::find_program_address(&[b"mpl-core-execute", k.as_ref()], &mpl_core::ID).0
        );
    }
}
