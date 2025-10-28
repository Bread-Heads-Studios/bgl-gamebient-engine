use bytemuck::{from_bytes_mut, Pod, Zeroable};
use shank::{ShankAccounts, ShankType};
use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult};

#[repr(C)]
#[derive(PartialEq, Eq, Debug, Clone, ShankType, Pod, Zeroable, Copy)]
pub struct UpdatePoolV1Args {
    #[skip]
    /// The discriminator for the instruction
    discriminator: u8,

    /// Padding for 8-byte alignment
    _padding1: [u8; 7],

    /// New reward rate for machine owners (0 means no change)
    pub machine_owner_reward_rate: u64,

    /// New reward rate for game creators (0 means no change)
    pub game_creator_reward_rate: u64,

    /// New reward rate for ghost owners (0 means no change)
    pub ghost_owner_reward_rate: u64,

    /// New lockup period for machine owners (0 means no change)
    pub machine_owner_lockup_period: i64,

    /// New lockup period for game creators (0 means no change)
    pub game_creator_lockup_period: i64,

    /// New lockup period for ghost owners (0 means no change)
    pub ghost_owner_lockup_period: i64,

    /// Whether to activate/deactivate the pool (0 = no change, 1 = inactive, 2 = active)
    pub is_active: u8,

    /// Padding for 8-byte alignment
    _padding2: [u8; 7],
}

#[derive(ShankAccounts)]
pub struct UpdatePoolV1Accounts<'a> {
    #[account(writable, desc = "The staking pool account")]
    pool: &'a AccountInfo<'a>,

    #[account(signer, desc = "The authority of the pool")]
    authority: &'a AccountInfo<'a>,
}

impl UpdatePoolV1Accounts<'_> {
    pub fn check(&self) -> ProgramResult {
        // TODO: Implement full account validation
        // - Verify pool is initialized
        // - Verify authority is signer
        // - Verify authority matches pool.authority

        Ok(())
    }
}

pub fn update_pool<'a>(accounts: &'a [AccountInfo<'a>], instruction_data: &[u8]) -> ProgramResult {
    let ctx = UpdatePoolV1Accounts::context(accounts);
    let mut args_data = instruction_data.to_vec();
    let _args: &UpdatePoolV1Args = from_bytes_mut(&mut args_data);

    ctx.accounts.check()?;

    // TODO: Read pool state
    // TODO: Verify all new values are valid
    // TODO: Update pool state with new values (only if non-zero/non-default)

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/

    // TODO: Write updated pool state back to account

    Ok(())
}
