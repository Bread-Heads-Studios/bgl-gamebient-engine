use num_derive::FromPrimitive;
use solana_program::{
    decode_error::DecodeError,
    msg,
    program_error::{PrintProgramError, ProgramError},
};
use thiserror::Error;

#[derive(Error, Clone, Debug, Eq, PartialEq, FromPrimitive)]
pub enum BglGhostError {
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

    /// 8 - Invalid Ghost PDA Derivation
    #[error("Invalid Ghost PDA Derivation")]
    InvalidGhostPdaDerivation,

    /// 9 - Player must sign
    #[error("Player must sign")]
    PlayerMustSign,
    // TODO: Add ghost-specific errors as needed:
    // /// 10 - Ghost has expired
    // #[error("Ghost has expired")]
    // GhostExpired,
    //
    // /// 11 - Invalid expiry timestamp
    // #[error("Invalid expiry timestamp")]
    // InvalidExpiryTimestamp,
    //
    // /// 12 - Insufficient payout amount
    // #[error("Insufficient payout amount")]
    // InsufficientPayoutAmount,
    //
    // /// 13 - Invalid game reference
    // #[error("Invalid game reference")]
    // InvalidGameReference,
    //
    // /// 14 - Ghost not expired
    // #[error("Ghost not expired")]
    // GhostNotExpired,
    //
    // /// 15 - Unauthorized to expire ghost
    // #[error("Unauthorized to expire ghost")]
    // UnauthorizedToExpire,
}

impl PrintProgramError for BglGhostError {
    fn print<E>(&self) {
        msg!(&self.to_string());
    }
}

impl From<BglGhostError> for ProgramError {
    fn from(e: BglGhostError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

impl<T> DecodeError<T> for BglGhostError {
    fn type_of() -> &'static str {
        "Bgl Ghost Error"
    }
}
