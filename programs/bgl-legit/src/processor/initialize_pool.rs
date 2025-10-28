use bytemuck::{from_bytes_mut, Pod, Zeroable};
use shank::{ShankAccounts, ShankType};
use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult, system_program};

use crate::{error::BglLegitError, state::StakingPool};

#[repr(C)]
#[derive(PartialEq, Eq, Debug, Clone, ShankType, Pod, Zeroable, Copy)]
pub struct InitializePoolV1Args {
    #[skip]
    /// The discriminator for the instruction
    discriminator: u8,

    /// Padding for 8-byte alignment
    _padding: [u8; 7],

    /// Reward rate for machine owners (basis points per day)
    pub machine_owner_reward_rate: u64,

    /// Reward rate for game creators (basis points per day)
    pub game_creator_reward_rate: u64,

    /// Reward rate for ghost owners (basis points per day)
    pub ghost_owner_reward_rate: u64,

    /// Lockup period for machine owners (seconds)
    pub machine_owner_lockup_period: i64,

    /// Lockup period for game creators (seconds)
    pub game_creator_lockup_period: i64,

    /// Lockup period for ghost owners (seconds)
    pub ghost_owner_lockup_period: i64,
}

#[derive(ShankAccounts)]
pub struct InitializePoolV1Accounts<'a> {
    #[account(writable, desc = "The staking pool account")]
    pool: &'a AccountInfo<'a>,

    #[account(desc = "The token mint for staking")]
    token_mint: &'a AccountInfo<'a>,

    #[account(writable, desc = "The vault to hold staked tokens and rewards")]
    vault: &'a AccountInfo<'a>,

    #[account(signer, desc = "The authority of the pool")]
    authority: &'a AccountInfo<'a>,

    #[account(writable, signer, desc = "The account paying for storage fees")]
    payer: &'a AccountInfo<'a>,

    #[account(desc = "The SPL Token program")]
    token_program: &'a AccountInfo<'a>,

    #[account(desc = "The system program")]
    system_program: &'a AccountInfo<'a>,
}

impl InitializePoolV1Accounts<'_> {
    pub fn check(&self) -> ProgramResult {
        // TODO: Implement full account validation
        // - Verify pool PDA derivation
        // - Verify vault PDA derivation
        // - Verify token_mint is the correct mint
        // - Verify authority signer
        // - Verify payer signer
        // - Verify token_program is SPL Token program
        // - Verify system_program is System program

        if !self.system_program.key.eq(&system_program::ID) {
            return Err(BglLegitError::InvalidSystemProgram.into());
        }

        Ok(())
    }
}

pub fn initialize_pool<'a>(
    accounts: &'a [AccountInfo<'a>],
    instruction_data: &[u8],
) -> ProgramResult {
    let ctx = InitializePoolV1Accounts::context(accounts);
    let mut args_data = instruction_data.to_vec();
    let args: &InitializePoolV1Args = from_bytes_mut(&mut args_data);

    ctx.accounts.check()?;

    // TODO: Validate reward rates are reasonable
    // TODO: Validate lockup periods are reasonable

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/

    // TODO: Create the pool account with proper PDA derivation
    // TODO: Create the vault token account with proper PDA derivation
    // TODO: Initialize the StakingPool state with provided parameters

    // Placeholder: This is where you would:
    // 1. Derive the pool PDA with seeds [POOL_PREFIX, authority]
    // 2. Create the pool account via CPI to system program
    // 3. Derive the vault PDA with seeds [VAULT_PREFIX, pool]
    // 4. Create the vault token account via CPI to token program
    // 5. Initialize the pool state

    let _pool_data = StakingPool {
        authority: *ctx.accounts.authority.key,
        token_mint: *ctx.accounts.token_mint.key,
        vault: *ctx.accounts.vault.key,
        machine_owner_reward_rate: args.machine_owner_reward_rate,
        game_creator_reward_rate: args.game_creator_reward_rate,
        ghost_owner_reward_rate: args.ghost_owner_reward_rate,
        machine_owner_lockup_period: args.machine_owner_lockup_period,
        game_creator_lockup_period: args.game_creator_lockup_period,
        ghost_owner_lockup_period: args.ghost_owner_lockup_period,
        total_staked: 0,
        is_active: 1,
    };

    // TODO: Write pool_data to pool account

    Ok(())
}
