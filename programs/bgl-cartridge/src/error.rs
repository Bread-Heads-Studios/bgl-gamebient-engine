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

    /// 25 - Invalid Library PDA Derivation
    #[error("Invalid Library PDA Derivation")]
    InvalidLibraryPdaDerivation,

    /// 26 - Curator must sign
    #[error("Curator must sign")]
    CuratorMustSign,

    /// 27 - Publisher must sign
    #[error("Publisher must sign")]
    PublisherMustSign,

    /// 28 - Invalid Publisher
    #[error("Signer is not the publisher recorded on the game")]
    InvalidPublisher,

    /// 29 - Library Delegate Already Set
    #[error("The game already has an UpdateDelegate plugin")]
    LibraryDelegateAlreadySet,

    /// 30 - Library Delegate Not Set
    #[error("The game has no library UpdateDelegate plugin")]
    LibraryDelegateNotSet,

    /// 31 - Invalid Library Delegate
    #[error("The game's UpdateDelegate does not name the library authority")]
    InvalidLibraryDelegate,

    /// 32 - Game Still Listed
    #[error("The game is still listed in a group that was not provided")]
    GameStillListed,

    /// 33 - Invalid Group
    #[error("Account is not a Core Group")]
    InvalidGroup,
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
