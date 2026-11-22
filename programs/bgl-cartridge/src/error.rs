use num_derive::FromPrimitive;
use num_traits::FromPrimitive as _;
use solana_program::{msg, program_error::ProgramError};
use thiserror::Error;

#[derive(Error, Clone, Debug, Eq, PartialEq, FromPrimitive)]
pub enum BglCartridgeError {
    /// 0 - Invalid System Program
    #[error("Invalid System Program")]
    InvalidSystemProgram,

    /// 1 - Error deserializing account
    #[error("Error deserializing account")]
    DeserializationError,

    /// 2 - Error serializing account
    #[error("Error serializing account")]
    SerializationError,

    /// 3 - Invalid MPL Core Program
    #[error("Invalid MPL Core Program")]
    InvalidMplCoreProgram,

    /// 4 - Invalid Name
    #[error("Invalid Name")]
    InvalidName,

    /// 5 - Invalid URI
    #[error("Invalid URI")]
    InvalidUri,

    /// 6 - Payer must sign
    #[error("Payer must sign")]
    PayerMustSign,

    /// 7 - Authority must sign
    #[error("Authority must sign")]
    AuthorityMustSign,

    /// 8 - Invalid Machine PDA Derivation
    #[error("Invalid Machine PDA Derivation")]
    InvalidMachinePdaDerivation,

    /// 9 - Cartridge Owner must sign
    #[error("Cartridge Owner must sign")]
    CartridgeOwnerMustSign,

    /// 10 - Invalid Game PDA Derivation
    #[error("Invalid Game PDA Derivation")]
    InvalidGamePdaDerivation,

    /// 11 - A cartridge is already inserted into the machine
    #[error("A cartridge is already inserted into the machine")]
    CartridgeAlreadyInserted,

    /// 12 - A cartridge is not inserted into the machine
    #[error("A cartridge is not inserted into the machine")]
    CartridgeNotInserted,

    /// 13 - Invalid Token Program
    #[error("Invalid Token Program")]
    InvalidTokenProgram,

    /// 14 - Invalid Payer Token Account
    #[error("Invalid Payer Token Account Program Owner")]
    InvalidPayerTokenAccountProgramOwner,

    /// 15 - Invalid Payer Token Account Owner
    #[error("Invalid Payer Token Account Owner")]
    InvalidPayerTokenAccountOwner,

    /// 16 - Invalid Payer Token Account Mint
    #[error("Invalid Payer Token Account Mint")]
    InvalidPayerTokenAccountMint,

    /// 17 - Invalid Game Token Account
    #[error("Invalid Game Token Account Program Owner")]
    InvalidGameTokenAccountProgramOwner,

    /// 18 - Invalid Game Token Account Owner
    #[error("Invalid Game Token Account Owner")]
    InvalidGameTokenAccountOwner,

    /// 19 - Invalid Game Token Account Mint
    #[error("Invalid Game Token Account Mint")]
    InvalidGameTokenAccountMint,

    /// 20 - Invalid Payment Mint
    #[error("Invalid Payment Mint")]
    InvalidPaymentMint,

    /// 21 - Invalid Associated Token Program
    #[error("Invalid Associated Token Program")]
    InvalidAssociatedTokenProgram,

    /// 22 - Invalid Source
    #[error("Source must be specified (Unknown is not a valid argument)")]
    InvalidSource,

    /// 23 - Invalid Source Authority
    #[error("Authority does not match the configured Source authority")]
    InvalidSourceAuthority,

    /// 24 - Source Already Set
    #[error("Cartridge source has already been set and cannot be changed")]
    SourceAlreadySet,

    /// 25 - Invalid Publisher
    #[error("Authority does not match the game's publisher")]
    InvalidPublisher,

    /// 26 - Invalid Game Data
    #[error("Game data has an unknown layout or version")]
    InvalidGameData,

    /// 27 - Burn Not Allowed For Mint
    #[error("Burn pricing is only allowed for CRUMBS")]
    BurnNotAllowedForMint,

    /// 28 - Invalid Look Id
    #[error("Look id must be 1-32 characters of a-z, 0-9 or -")]
    InvalidLookId,

    /// 29 - Invalid Look PDA Derivation
    #[error("Look account does not match the expected PDA")]
    InvalidLookPdaDerivation,

    /// 30 - Invalid Look Data
    #[error("Look data has an unknown layout or version")]
    InvalidLookData,

    /// 31 - Not Cartridge Owner
    #[error("Signer does not own the cartridge")]
    NotCartridgeOwner,

    /// 32 - Cartridge Not In Game
    #[error("Cartridge does not belong to the look's game")]
    CartridgeNotInGame,

    /// 33 - Invalid Asset Signer
    #[error("Account does not match the cartridge's asset signer")]
    InvalidAssetSigner,

    /// 34 - Not Look Creator
    #[error("Authority does not match the look's creator")]
    NotLookCreator,

    /// 35 - Revenue Share Not Supported
    #[error("Look revenue shares must be zero")]
    RevenueShareNotSupported,

    /// 36 - Invalid Creator Token Account
    #[error("Token account is not owned by the look's creator")]
    InvalidCreatorTokenAccount,

    /// 37 - Look Price Changed
    #[error("The look's price is above the buyer's maximum")]
    LookPriceChanged,
}

impl BglCartridgeError {
    /// Logs the message for `error`, decoding custom error codes into this enum.
    pub fn print(error: &ProgramError) {
        match error {
            ProgramError::Custom(code) => match Self::from_u32(*code) {
                Some(e) => msg!(&e.to_string()),
                None => msg!(&error.to_string()),
            },
            _ => msg!(&error.to_string()),
        }
    }
}

impl From<BglCartridgeError> for ProgramError {
    fn from(e: BglCartridgeError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
