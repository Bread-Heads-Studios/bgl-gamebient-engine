use num_derive::FromPrimitive;
use num_traits::FromPrimitive as _;
use solana_program::{msg, program_error::ProgramError};
use thiserror::Error;

#[derive(Error, Clone, Debug, Eq, PartialEq, FromPrimitive)]
pub enum BglGhostError {
    /// 0 - Invalid System Program
    #[error("Invalid System Program")]
    InvalidSystemProgram,

    /// 1 - Error deserializing account
    #[error("Error deserializing account")]
    DeserializationError,

    /// 2 - Invalid MPL Core Program
    #[error("Invalid MPL Core Program")]
    InvalidMplCoreProgram,

    /// 3 - Invalid Name
    #[error("Invalid Name")]
    InvalidName,

    /// 4 - Invalid URI
    #[error("Invalid URI")]
    InvalidUri,

    /// 5 - Payer must sign
    #[error("Payer must sign")]
    PayerMustSign,

    /// 6 - Authority must sign
    #[error("Authority must sign")]
    AuthorityMustSign,

    /// 7 - Invalid Crown PDA Derivation
    #[error("Invalid Crown PDA Derivation")]
    InvalidCrownPdaDerivation,

    /// 8 - Invalid Crown Asset PDA Derivation
    #[error("Invalid Crown Asset PDA Derivation")]
    InvalidCrownAssetPdaDerivation,

    /// 9 - Invalid Crown Account
    #[error("Invalid Crown Account")]
    InvalidCrownAccount,

    /// 10 - Invalid Crown Asset
    #[error("Invalid Crown Asset")]
    InvalidCrownAsset,

    /// 11 - Invalid Asset Signer
    #[error("Invalid Asset Signer")]
    InvalidAssetSigner,

    /// 12 - Invalid Attestor
    #[error("Invalid Attestor")]
    InvalidAttestor,

    /// 13 - Attestor must sign
    #[error("Attestor must sign")]
    AttestorMustSign,

    /// 14 - Invalid Authority
    #[error("Invalid Authority")]
    InvalidAuthority,

    /// 15 - Score does not beat the current high score
    #[error("Score does not beat the current high score")]
    ScoreNotHigher,

    /// 16 - Crown season has ended
    #[error("Crown season has ended")]
    CrownInactive,

    /// 17 - Invalid Mint Account
    #[error("Invalid Mint Account")]
    InvalidMintAccount,

    /// 18 - Invalid Vault Account
    #[error("Invalid Vault Account")]
    InvalidVaultAccount,

    /// 19 - Invalid Pot Account
    #[error("Invalid Pot Account")]
    InvalidPotAccount,

    /// 20 - Invalid SPL Token Program
    #[error("Invalid SPL Token Program")]
    InvalidSplTokenProgram,

    /// 21 - Invalid Associated Token Program
    #[error("Invalid Associated Token Program")]
    InvalidAssociatedTokenProgram,
}

impl BglGhostError {
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

impl From<BglGhostError> for ProgramError {
    fn from(e: BglGhostError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
