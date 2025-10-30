pub mod entrypoint;
pub mod error;
pub mod instruction;
pub mod processor;
pub mod state;

pub use solana_program;

// TODO: This is a placeholder program ID. After deploying the program,
// update this with the actual deployed program ID.
solana_program::declare_id!("LEG1T5rABhAnNFz62E4x2dSMjfsuDQyfc5sZjJi9tCq");
