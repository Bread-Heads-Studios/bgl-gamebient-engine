use bytemuck::{from_bytes, from_bytes_mut, Pod, Zeroable};
use mpl_utils::{assert_owned_by, assert_signer, cmp_pubkeys};
use shank::{ShankAccounts, ShankType};
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError,
};

use crate::{
    error::BglLegitError,
    state::{StakingConfig, StakingPool},
};

#[repr(C)]
#[derive(PartialEq, Eq, Debug, Clone, ShankType, Pod, Zeroable, Copy)]
pub struct UpdatePoolV1Args {
    #[skip]
    /// The discriminator for the instruction
    discriminator: u8,

    /// Padding for 8-byte alignment
    _padding1: [u8; 7],

    /// New staking config for machine owners (0 means no change)
    pub machine_owner_config: StakingConfig,

    /// New staking config for game creators (0 means no change)
    pub game_creator_config: StakingConfig,

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
    pub fn check(&self) -> Result<(), ProgramError> {
        let Self { pool, authority } = self;

        // Verify pool is owned by this program
        assert_owned_by(pool, &crate::ID, BglLegitError::InvalidPoolAccount)?;

        // Verify pool has correct size
        if pool.data_len() != core::mem::size_of::<StakingPool>() {
            return Err(BglLegitError::InvalidPoolAccount.into());
        }

        // Read pool state to verify authority
        let pool_data = pool.try_borrow_data()?;
        let pool_state: &StakingPool = from_bytes(&pool_data);

        // Verify authority is signer
        assert_signer(authority).map_err(|_| BglLegitError::AuthorityMustSign)?;

        // Verify authority matches pool.authority
        if !cmp_pubkeys(authority.key, &pool_state.authority) {
            return Err(BglLegitError::InvalidAuthority.into());
        }

        Ok(())
    }
}

pub fn update_pool<'a>(accounts: &'a [AccountInfo<'a>], instruction_data: &[u8]) -> ProgramResult {
    let ctx = UpdatePoolV1Accounts::context(accounts);
    let mut args_data = instruction_data.to_vec();
    let args: &UpdatePoolV1Args = from_bytes_mut(&mut args_data);

    ctx.accounts.check()?;

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/

    // Read and update pool state
    let mut pool_data = ctx.accounts.pool.try_borrow_mut_data()?;
    let pool: &mut StakingPool = from_bytes_mut(&mut pool_data);

    // Update machine owner config if values are non-zero
    if args.machine_owner_config.reward_rate > 0 {
        pool.machine_owner_config.reward_rate = args.machine_owner_config.reward_rate;
    }
    if args.machine_owner_config.lockup_period != 0 {
        pool.machine_owner_config.lockup_period = args.machine_owner_config.lockup_period;
    }

    // Update game creator config if values are non-zero
    if args.game_creator_config.reward_rate > 0 {
        pool.game_creator_config.reward_rate = args.game_creator_config.reward_rate;
    }
    if args.game_creator_config.lockup_period != 0 {
        pool.game_creator_config.lockup_period = args.game_creator_config.lockup_period;
    }

    // Update is_active if specified (1 = inactive, 2 = active)
    if args.is_active == 1 {
        pool.is_active = 0;
    } else if args.is_active == 2 {
        pool.is_active = 1;
    }

    Ok(())
}
