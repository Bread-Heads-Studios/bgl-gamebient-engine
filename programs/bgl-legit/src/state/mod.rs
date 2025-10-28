pub mod stake_account;
pub mod staker_type;
pub mod staking_pool;

pub use stake_account::*;
pub use staker_type::*;
pub use staking_pool::*;

// PDA seeds
pub const POOL_PREFIX: &[u8] = b"pool";
pub const STAKE_PREFIX: &[u8] = b"stake";
pub const VAULT_PREFIX: &[u8] = b"vault";

// Token mint for staking
// TODO: Verify this is the correct token mint address
pub const STAKING_TOKEN_MINT: &str = "BQDMYwgnWr9UBcUCvLX67yXriTVe1bkPEiTQ1TzKpump";
