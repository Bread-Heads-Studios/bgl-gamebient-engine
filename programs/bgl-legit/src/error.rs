use num_derive::FromPrimitive;
use solana_program::{
    decode_error::DecodeError,
    msg,
    program_error::{PrintProgramError, ProgramError},
};
use thiserror::Error;

#[derive(Error, Clone, Debug, Eq, PartialEq, FromPrimitive)]
pub enum BglLegitError {
    /// 0 - Invalid System Program
    #[error("Invalid System Program")]
    InvalidSystemProgram,

    /// 1 - Error deserializing account
    #[error("Error deserializing account")]
    DeserializationError,

    /// 2 - Error serializing account
    #[error("Error serializing account")]
    SerializationError,

    /// 3 - Invalid SPL Token Program
    #[error("Invalid SPL Token Program")]
    InvalidSplTokenProgram,

    /// 4 - Invalid Associated Token Program
    #[error("Invalid Associated Token Program")]
    InvalidAssociatedTokenProgram,

    /// 5 - Authority must sign
    #[error("Authority must sign")]
    AuthorityMustSign,

    /// 6 - Payer must sign
    #[error("Payer must sign")]
    PayerMustSign,

    /// 7 - Staker must sign
    #[error("Staker must sign")]
    StakerMustSign,

    /// 8 - Invalid Pool PDA Derivation
    #[error("Invalid Pool PDA Derivation")]
    InvalidPoolPdaDerivation,

    /// 9 - Invalid Stake Account PDA Derivation
    #[error("Invalid Stake Account PDA Derivation")]
    InvalidStakeAccountPdaDerivation,

    /// 10 - Invalid Reward Vault PDA Derivation
    #[error("Invalid Reward Vault PDA Derivation")]
    InvalidRewardVaultPdaDerivation,

    /// 11 - Invalid Token Mint
    #[error("Invalid Token Mint")]
    InvalidTokenMint,

    /// 12 - Insufficient Stake Amount
    #[error("Insufficient Stake Amount")]
    InsufficientStakeAmount,

    /// 13 - Stake Still Locked
    #[error("Stake Still Locked")]
    StakeStillLocked,

    /// 14 - Invalid Staker Type
    #[error("Invalid Staker Type")]
    InvalidStakerType,

    /// 15 - Pool Not Initialized
    #[error("Pool Not Initialized")]
    PoolNotInitialized,

    /// 16 - Stake Account Not Initialized
    #[error("Stake Account Not Initialized")]
    StakeAccountNotInitialized,

    /// 17 - Invalid Reward Rate
    #[error("Invalid Reward Rate")]
    InvalidRewardRate,

    /// 18 - Invalid Lockup Period
    #[error("Invalid Lockup Period")]
    InvalidLockupPeriod,

    /// 19 - Arithmetic Overflow
    #[error("Arithmetic Overflow")]
    ArithmeticOverflow,

    /// 20 - Insufficient Rewards Available
    #[error("Insufficient Rewards Available")]
    InsufficientRewardsAvailable,

    /// 21 - Invalid Mint Account
    #[error("Invalid Mint Account")]
    InvalidMintAccount,

    /// 22 - Invalid Authority
    #[error("Invalid Authority")]
    InvalidAuthority,

    /// 23 - Invalid Pool Account
    #[error("Invalid Pool Account")]
    InvalidPoolAccount,

    /// 24 - Invalid Stake Account
    #[error("Invalid Stake Account")]
    InvalidStakeAccount,

    /// 25 - Insufficient Token Balance
    #[error("Insufficient Token Balance")]
    InsufficientTokenBalance,
}

impl PrintProgramError for BglLegitError {
    fn print<E>(&self) {
        msg!(&self.to_string());
    }
}

impl From<BglLegitError> for ProgramError {
    fn from(e: BglLegitError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

impl<T> DecodeError<T> for BglLegitError {
    fn type_of() -> &'static str {
        "Bgl Legit Error"
    }
}
