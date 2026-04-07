use bytemuck::{from_bytes_mut, Pod, Zeroable};
use shank::ShankType;
use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, sysvar::Sysvar,
};

use crate::instruction::accounts::ClaimRewardsV1Accounts;

#[repr(C)]
#[derive(PartialEq, Eq, Debug, Clone, ShankType, Pod, Zeroable, Copy)]
pub struct ClaimRewardsV1Args {
    #[skip]
    /// The discriminator for the instruction
    discriminator: u8,
}

impl ClaimRewardsV1Accounts<'_> {
    pub fn check(&self) -> ProgramResult {
        // TODO: Implement full account validation
        // - Verify pool is initialized
        // - Verify stake_account belongs to staker
        // - Verify staker is signer
        // - Verify token accounts are valid
        // - Verify vault_authority PDA derivation

        Ok(())
    }
}

pub fn claim_rewards<'a>(
    accounts: &'a [AccountInfo<'a>],
    instruction_data: &[u8],
) -> ProgramResult {
    let ctx = ClaimRewardsV1Accounts::context(accounts)?;
    let mut args_data = instruction_data.to_vec();
    let _args: &ClaimRewardsV1Args = from_bytes_mut(&mut args_data);

    ctx.accounts.check()?;

    // Get current time
    let clock = Clock::get()?;
    let _current_time = clock.unix_timestamp;

    // TODO: Read pool state
    // TODO: Read stake_account state
    // TODO: Calculate pending rewards using stake.calculate_pending_rewards(pool, current_time)
    // TODO: Verify vault has sufficient rewards

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/

    // TODO: Transfer reward tokens from vault to staker's token account
    // TODO: Update stake_account's last_reward_time to current_time
    // TODO: Update stake_account's total_rewards_claimed

    Ok(())
}
