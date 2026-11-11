use borsh::{BorshDeserialize, BorshSerialize};
use bytemuck::{Pod, Zeroable};
use shank::{ShankAccount, ShankType};
use solana_program::pubkey::Pubkey;

use crate::error::BglGhostError;

pub const CROWN_PREFIX: &[u8] = b"crown";
pub const CROWN_ASSET_PREFIX: &[u8] = b"crown_asset";
/// Seed prefix mpl-core uses for an asset's signer PDA (used by `Execute`).
pub const ASSET_SIGNER_PREFIX: &[u8] = b"mpl-core-execute";

/// Length of the rolling window `daily_payout_cap` applies to.
pub const PAYOUT_WINDOW_SECONDS: i64 = 86_400;

/// Account discriminator for crown accounts.
pub const CROWN_KEY: u8 = 1;

/// Reward settings for a crown. All amounts are in base units of the reward mint.
#[repr(C)]
#[derive(
    Pod, Zeroable, BorshSerialize, BorshDeserialize, PartialEq, Eq, Debug, Copy, Clone, ShankType,
)]
pub struct CrownConfig {
    /// Paid into the pot each time the crown changes hands.
    pub capture_bounty: u64,
    /// Paid into the pot per second while the crown is held.
    pub accrual_rate: u64,
    /// The pot is never filled above this balance (0 = no cap).
    pub pot_cap: u64,
    /// Maximum paid out of the vault per 24h window (0 = no cap).
    pub daily_payout_cap: u64,
}

/// A single high-score crown for one game season.
///
/// The crown is a frozen Core asset that only this program can move (via its
/// permanent transfer delegate). Winnings accumulate in the asset's signer PDA
/// token account (the "pot"), so they travel with the crown until the current
/// holder cashes out with Core `Execute`.
#[repr(C)]
#[derive(Pod, Zeroable, PartialEq, Eq, Debug, Copy, Clone, ShankAccount)]
pub struct Crown {
    /// Admin that can update the config and end the season.
    pub authority: Pubkey,
    /// Backend key that must co-sign every score submission.
    pub attestor: Pubkey,
    /// The game this crown belongs to.
    pub game: Pubkey,
    /// The crown Core asset.
    pub asset: Pubkey,
    /// Mint rewards are paid in.
    pub reward_mint: Pubkey,
    /// Current holder (default pubkey until first claimed).
    pub holder: Pubkey,
    /// Score to beat.
    pub high_score: u64,
    /// When the current holder took the crown.
    pub held_since: i64,
    /// Last time accrual was paid into the pot.
    pub last_accrual: i64,
    pub config: CrownConfig,
    /// Start of the current payout window.
    pub window_start: i64,
    /// Amount paid out in the current payout window.
    pub window_paid: u64,
    pub season: u32,
    pub key: u8,
    pub bump: u8,
    pub asset_signer_bump: u8,
    /// 1 while the season is running, 0 once ended.
    pub is_active: u8,
}

impl Crown {
    pub const LEN: usize = core::mem::size_of::<Self>();

    pub fn has_holder(&self) -> bool {
        self.holder != Pubkey::default()
    }

    pub fn asset_signer(&self) -> Result<Pubkey, BglGhostError> {
        Pubkey::create_program_address(
            &[
                ASSET_SIGNER_PREFIX,
                self.asset.as_ref(),
                &[self.asset_signer_bump],
            ],
            &mpl_core::ID,
        )
        .map_err(|_| BglGhostError::InvalidAssetSigner)
    }

    /// Amount of accrual owed since `last_accrual`, before any caps.
    pub fn pending_accrual(&self, now: i64) -> u64 {
        if !self.has_holder() || self.is_active == 0 {
            return 0;
        }
        let elapsed = now.saturating_sub(self.last_accrual).max(0) as u64;
        self.config.accrual_rate.saturating_mul(elapsed)
    }

    /// Clamps `amount` to the pot cap, the vault balance and the daily payout
    /// cap, and records it against the payout window.
    pub fn take_payout(
        &mut self,
        now: i64,
        amount: u64,
        vault_balance: u64,
        pot_balance: u64,
    ) -> u64 {
        if now.saturating_sub(self.window_start) >= PAYOUT_WINDOW_SECONDS {
            self.window_start = now;
            self.window_paid = 0;
        }

        let mut payout = amount.min(vault_balance);
        if self.config.pot_cap != 0 {
            payout = payout.min(self.config.pot_cap.saturating_sub(pot_balance));
        }
        if self.config.daily_payout_cap != 0 {
            payout = payout.min(
                self.config
                    .daily_payout_cap
                    .saturating_sub(self.window_paid),
            );
        }

        self.window_paid = self.window_paid.saturating_add(payout);
        payout
    }
}
