use borsh::BorshDeserialize;
use mpl_core::{
    instructions::{
        TransferV1Cpi, TransferV1InstructionArgs, UpdatePluginV1Cpi, UpdatePluginV1InstructionArgs,
    },
    types::{Attributes, Plugin},
};
use mpl_utils::{assert_signer, cmp_pubkeys};
use shank::ShankType;
use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult,
    program_error::ProgramError, sysvar::Sysvar,
};
use solana_system_interface::program as system_program;

use crate::{
    error::BglGhostError,
    instruction::accounts::ClaimCrownV1Accounts,
    processor::{
        create_crown::crown_attributes,
        crown_utils::{
            accrue, assert_token_program, load_crown, pot_balance, save_crown, transfer_from_vault,
            vault_balance, with_crown_seeds,
        },
    },
    state::Crown,
};

#[repr(C)]
#[derive(PartialEq, Eq, Debug, Clone, ShankType, BorshDeserialize)]
pub struct ClaimCrownV1Args {
    /// The verified score. Must beat the current high score.
    pub score: u64,
}

impl ClaimCrownV1Args {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        // Skip the discriminator
        Self::try_from_slice(&input[1..]).map_err(|_| ProgramError::InvalidInstructionData)
    }
}

impl ClaimCrownV1Accounts<'_> {
    pub fn check(&self, state: &Crown, args: &ClaimCrownV1Args) -> ProgramResult {
        let Self {
            crown: _,
            asset,
            new_holder: _,
            vault: _,
            pot: _,
            attestor,
            payer,
            mpl_core_program,
            token_program,
            system_program,
        } = self;

        // Crown
        // SAFE: Loaded and validated by `load_crown`.
        if state.is_active == 0 {
            return Err(BglGhostError::CrownInactive.into());
        }

        // Score
        if args.score <= state.high_score {
            return Err(BglGhostError::ScoreNotHigher.into());
        }

        // Asset
        if !cmp_pubkeys(asset.key, &state.asset) {
            return Err(BglGhostError::InvalidCrownAsset.into());
        }

        // New holder
        // SAFE: Covered by the attestor's signature over the transaction.

        // Vault, Pot
        // SAFE: Validated before each transfer.

        // Attestor
        assert_signer(attestor).map_err(|_| BglGhostError::AttestorMustSign)?;
        if !cmp_pubkeys(attestor.key, &state.attestor) {
            return Err(BglGhostError::InvalidAttestor.into());
        }

        // Payer
        assert_signer(payer).map_err(|_| BglGhostError::PayerMustSign)?;

        // MPL Core Program
        if !cmp_pubkeys(mpl_core_program.key, &mpl_core::ID) {
            return Err(BglGhostError::InvalidMplCoreProgram.into());
        }

        // Token Program
        assert_token_program(token_program)?;

        // System Program
        if !cmp_pubkeys(system_program.key, &system_program::ID) {
            return Err(BglGhostError::InvalidSystemProgram.into());
        }

        Ok(())
    }
}

pub fn claim_crown<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = ClaimCrownV1Accounts::context(accounts)?;

    let args = ClaimCrownV1Args::unpack(args)?;
    let mut state = load_crown(ctx.accounts.crown)?;
    ctx.accounts.check(&state, &args)?;

    let now = Clock::get()?.unix_timestamp;
    let is_capture = !cmp_pubkeys(ctx.accounts.new_holder.key, &state.holder);

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/
    // Settle the outgoing reign first. The pot travels with the crown, so
    // anything the previous holder didn't cash out goes to the new holder.
    accrue(
        ctx.accounts.token_program,
        ctx.accounts.vault,
        ctx.accounts.pot,
        ctx.accounts.crown,
        &mut state,
        now,
    )?;

    if is_capture {
        with_crown_seeds(&state, |seeds| {
            TransferV1Cpi {
                __program: ctx.accounts.mpl_core_program,
                asset: ctx.accounts.asset,
                collection: None,
                payer: ctx.accounts.payer,
                authority: Some(ctx.accounts.crown),
                new_owner: ctx.accounts.new_holder,
                system_program: Some(ctx.accounts.system_program),
                log_wrapper: None,
                __args: TransferV1InstructionArgs {
                    compression_proof: None,
                },
            }
            .invoke_signed(&[seeds])
        })?;

        // Capture bounty. Only paid when the crown changes hands so a holder
        // can't farm it by inching up their own score.
        let vault_balance = vault_balance(ctx.accounts.vault, ctx.accounts.crown.key, &state)?;
        let pot_balance = pot_balance(ctx.accounts.pot, &state)?;
        let bounty =
            state.take_payout(now, state.config.capture_bounty, vault_balance, pot_balance);
        transfer_from_vault(
            ctx.accounts.token_program,
            ctx.accounts.vault,
            ctx.accounts.pot,
            ctx.accounts.crown,
            &state,
            bounty,
        )?;

        state.holder = *ctx.accounts.new_holder.key;
        state.held_since = now;
    }

    state.high_score = args.score;
    save_crown(ctx.accounts.crown, &state)?;

    // Show the new high score on the asset.
    with_crown_seeds(&state, |seeds| {
        UpdatePluginV1Cpi {
            __program: ctx.accounts.mpl_core_program,
            asset: ctx.accounts.asset,
            collection: None,
            payer: ctx.accounts.payer,
            authority: Some(ctx.accounts.crown),
            system_program: ctx.accounts.system_program,
            log_wrapper: None,
            __args: UpdatePluginV1InstructionArgs {
                plugin: Plugin::Attributes(Attributes {
                    attribute_list: crown_attributes(state.season, args.score),
                }),
            },
        }
        .invoke_signed(&[seeds])
    })
}
