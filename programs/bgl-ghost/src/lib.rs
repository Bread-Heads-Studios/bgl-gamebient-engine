pub mod entrypoint;
pub mod error;
pub mod instruction;
pub mod processor;
pub mod state;

pub use solana_program;

// TODO: Replace with actual program ID after generating keypair
solana_program::declare_id!("GHoSTpSurgVaWBYJXnDZgiMMdKsWxjWmCvtVqE23JiS3");
