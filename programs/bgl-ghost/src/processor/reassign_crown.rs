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
    program_error::ProgramError, pubkey::Pubkey, sysvar::Sysvar,
};
use solana_system_interface::program as system_program;

use crate::{
    error::BglGhostError,
    instruction::accounts::ReassignCrownV1Accounts,
    processor::{
        create_crown::crown_attributes,
        crown_utils::{accrue, assert_token_program, load_crown, save_crown, with_crown_seeds},
    },
    state::Crown,
};

#[repr(C)]
#[derive(PartialEq, Eq, Debug, Clone, ShankType, BorshDeserialize)]
pub struct ReassignCrownV1Args {
    /// The score to beat from now on. May be lower than the current one.
    pub high_score: u64,
}

impl ReassignCrownV1Args {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        // Skip the discriminator
        Self::try_from_slice(&input[1..]).map_err(|_| ProgramError::InvalidInstructionData)
    }
}

impl ReassignCrownV1Accounts<'_> {
    pub fn check(&self, state: &Crown) -> ProgramResult {
        let Self {
            crown: _,
            asset,
            new_holder: _,
            vault: _,
            pot: _,
            authority,
            payer,
            mpl_core_program,
            token_program,
            system_program,
        } = self;

        // Crown
        // SAFE: Loaded and validated by `load_crown`. Ended seasons are allowed
        // on purpose: a fraudulent final holder must not keep the trophy.

        // Asset
        if !cmp_pubkeys(asset.key, &state.asset) {
            return Err(BglGhostError::InvalidCrownAsset.into());
        }

        // New holder
        // SAFE: Chosen by the authority. The crown PDA itself means "unclaimed".

        // Vault, Pot
        // SAFE: Validated before the transfer.

        // Authority
        assert_signer(authority).map_err(|_| BglGhostError::AuthorityMustSign)?;
        if !cmp_pubkeys(authority.key, &state.authority) {
            return Err(BglGhostError::InvalidAuthority.into());
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

/// Authority override for a crown taken by a score later found to be
/// fraudulent: moves the crown (and its pot) to `new_holder`, or back to the
/// crown PDA to leave it unclaimed, and sets the score to beat. Accrual owed so
/// far is paid into the pot first, so it goes with the crown to the new holder.
/// No capture bounty is paid. Whatever the outgoing holder already cashed out
/// can't be recovered.
pub fn reassign_crown<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = ReassignCrownV1Accounts::context(accounts)?;

    let args = ReassignCrownV1Args::unpack(args)?;
    let mut state = load_crown(ctx.accounts.crown)?;
    ctx.accounts.check(&state)?;

    let now = Clock::get()?.unix_timestamp;
    let unclaim = cmp_pubkeys(ctx.accounts.new_holder.key, ctx.accounts.crown.key);
    let new_holder = if unclaim {
        Pubkey::default()
    } else {
        *ctx.accounts.new_holder.key
    };

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/
    accrue(
        ctx.accounts.token_program,
        ctx.accounts.vault,
        ctx.accounts.pot,
        ctx.accounts.crown,
        &mut state,
        now,
    )?;

    if !cmp_pubkeys(&new_holder, &state.holder) {
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

        state.holder = new_holder;
        state.held_since = if unclaim { 0 } else { now };
    }

    state.high_score = args.high_score;
    save_crown(ctx.accounts.crown, &state)?;

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
                    attribute_list: crown_attributes(state.season, args.high_score),
                }),
            },
        }
        .invoke_signed(&[seeds])
    })
}
