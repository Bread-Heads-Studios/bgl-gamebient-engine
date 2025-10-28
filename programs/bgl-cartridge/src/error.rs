use num_derive::FromPrimitive;
use solana_program::{
    decode_error::DecodeError,
    msg,
    program_error::{PrintProgramError, ProgramError},
};
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
}

impl PrintProgramError for BglCartridgeError {
    fn print<E>(&self) {
        msg!(&self.to_string());
    }
}

impl From<BglCartridgeError> for ProgramError {
    fn from(e: BglCartridgeError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

impl<T> DecodeError<T> for BglCartridgeError {
    fn type_of() -> &'static str {
        "Bgl Cartridge Error"
    }
}
