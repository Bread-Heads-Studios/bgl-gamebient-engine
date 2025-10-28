use bytemuck::{from_bytes_mut, Pod, Zeroable};
use shank::{ShankAccounts, ShankType};
use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, sysvar::Sysvar,
};

use crate::state::StakeAccount;

#[repr(C)]
#[derive(PartialEq, Eq, Debug, Clone, ShankType, Pod, Zeroable, Copy)]
pub struct CreateStakeV1Args {
    #[skip]
    /// The discriminator for the instruction
    discriminator: u8,

    /// The type of staker (0=MachineOwner, 1=GameCreator, 2=GhostOwner)
    pub staker_type: u8,

    /// Padding for alignment
    _padding: [u8; 6],

    /// Amount to stake
    pub amount: u64,
}

#[derive(ShankAccounts)]
pub struct CreateStakeV1Accounts<'a> {
    #[account(writable, desc = "The staking pool account")]
    pool: &'a AccountInfo<'a>,

    #[account(writable, desc = "The stake account to create")]
    stake_account: &'a AccountInfo<'a>,

    #[account(writable, signer, desc = "The staker")]
    staker: &'a AccountInfo<'a>,

    #[account(writable, desc = "The staker's token account")]
    staker_token_account: &'a AccountInfo<'a>,

    #[account(writable, desc = "The pool's vault token account")]
    vault: &'a AccountInfo<'a>,

    #[account(writable, signer, desc = "The account paying for storage fees")]
    payer: &'a AccountInfo<'a>,

    #[account(desc = "The SPL Token program")]
    token_program: &'a AccountInfo<'a>,

    #[account(desc = "The system program")]
    system_program: &'a AccountInfo<'a>,
}

impl CreateStakeV1Accounts<'_> {
    pub fn check(&self, _args: &CreateStakeV1Args) -> ProgramResult {
        // TODO: Implement full account validation
        // - Verify pool is initialized
        // - Verify stake_account PDA derivation [STAKE_PREFIX, pool, staker]
        // - Verify staker is signer
        // - Verify payer is signer
        // - Verify token accounts are valid
        // - Verify token_program is SPL Token program
        // - Verify system_program is System program
        // - Verify amount > 0

        Ok(())
    }
}

pub fn create_stake<'a>(accounts: &'a [AccountInfo<'a>], instruction_data: &[u8]) -> ProgramResult {
    let ctx = CreateStakeV1Accounts::context(accounts);
    let mut args_data = instruction_data.to_vec();
    let args: &CreateStakeV1Args = from_bytes_mut(&mut args_data);

    ctx.accounts.check(args)?;

    // Get current time
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;

    // TODO: Validate staker type is valid
    // TODO: Read pool state to get lockup period for this staker type
    // TODO: Calculate lockup_end_time = current_time + pool.get_lockup_period(staker_type)

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/

    // TODO: Create the stake account with proper PDA derivation
    // TODO: Transfer tokens from staker's token account to vault
    // TODO: Update pool's total_staked
    // TODO: Initialize the StakeAccount state

    let _stake_data = StakeAccount {
        pool: *ctx.accounts.pool.key,
        owner: *ctx.accounts.staker.key,
        staker_type: args.staker_type,
        amount_staked: args.amount,
        stake_start_time: current_time,
        lockup_end_time: current_time, // TODO: Add actual lockup period
        last_reward_time: current_time,
        total_rewards_claimed: 0,
        _padding: [0; 7],
    };

    // TODO: Write stake_data to stake_account

    Ok(())
}
