use mpl_utils::cmp_pubkeys;
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program::invoke_signed,
    program_error::ProgramError, program_option::COption, program_pack::Pack, pubkey::Pubkey,
};
use spl_token::state::Account as TokenAccount;

use crate::{
    error::BglGhostError,
    state::{Crown, CROWN_KEY, CROWN_PREFIX},
};

pub fn load_crown(crown: &AccountInfo) -> Result<Crown, ProgramError> {
    if !cmp_pubkeys(crown.owner, &crate::ID) || crown.data_len() != Crown::LEN {
        return Err(BglGhostError::InvalidCrownAccount.into());
    }
    let state: Crown = bytemuck::try_pod_read_unaligned(&crown.try_borrow_data()?)
        .map_err(|_| BglGhostError::DeserializationError)?;
    if state.key != CROWN_KEY {
        return Err(BglGhostError::InvalidCrownAccount.into());
    }
    Ok(state)
}

pub fn save_crown(crown: &AccountInfo, state: &Crown) -> ProgramResult {
    crown
        .try_borrow_mut_data()?
        .copy_from_slice(bytemuck::bytes_of(state));
    Ok(())
}

/// Runs `f` with the crown PDA signer seeds.
pub fn with_crown_seeds<R>(state: &Crown, f: impl FnOnce(&[&[u8]]) -> R) -> R {
    let season = state.season.to_le_bytes();
    let bump = [state.bump];
    f(&[
        CROWN_PREFIX,
        state.authority.as_ref(),
        state.game.as_ref(),
        &season,
        &bump,
    ])
}

pub fn assert_token_program(token_program: &AccountInfo) -> ProgramResult {
    if !cmp_pubkeys(token_program.key, &spl_token::ID) {
        return Err(BglGhostError::InvalidSplTokenProgram.into());
    }
    Ok(())
}

fn unpack_token_account(account: &AccountInfo) -> Option<TokenAccount> {
    if !cmp_pubkeys(account.owner, &spl_token::ID) {
        return None;
    }
    TokenAccount::unpack(&account.try_borrow_data().ok()?).ok()
}

/// Validates the crown's reward vault and returns its balance.
pub fn vault_balance(
    vault: &AccountInfo,
    crown: &Pubkey,
    state: &Crown,
) -> Result<u64, ProgramError> {
    match unpack_token_account(vault) {
        Some(account) if account.owner == *crown && account.mint == state.reward_mint => {
            Ok(account.amount)
        }
        _ => Err(BglGhostError::InvalidVaultAccount.into()),
    }
}

/// Validates a pot token account and returns its balance.
///
/// Any token account owned by the asset signer works, so a holder who tampers
/// with the canonical ATA (closing it, reassigning it or approving a delegate
/// through `Execute`) can't block the crown: the next claimant passes a clean
/// account instead. Accounts with a delegate or close authority are rejected so
/// a previous holder can't keep a claw on deposits after losing the crown.
pub fn pot_balance(pot: &AccountInfo, state: &Crown) -> Result<u64, ProgramError> {
    let asset_signer = state.asset_signer()?;
    match unpack_token_account(pot) {
        Some(account)
            if account.owner == asset_signer
                && account.mint == state.reward_mint
                && account.delegate == COption::None
                && account.close_authority == COption::None =>
        {
            Ok(account.amount)
        }
        _ => Err(BglGhostError::InvalidPotAccount.into()),
    }
}

/// Transfers `amount` from the vault, signed by the crown PDA.
pub fn transfer_from_vault<'a>(
    token_program: &AccountInfo<'a>,
    vault: &AccountInfo<'a>,
    destination: &AccountInfo<'a>,
    crown: &AccountInfo<'a>,
    state: &Crown,
    amount: u64,
) -> ProgramResult {
    if amount == 0 {
        return Ok(());
    }
    with_crown_seeds(state, |seeds| {
        invoke_signed(
            &spl_token::instruction::transfer(
                &spl_token::ID,
                vault.key,
                destination.key,
                crown.key,
                &[],
                amount,
            )?,
            &[
                vault.clone(),
                destination.clone(),
                crown.clone(),
                token_program.clone(),
            ],
            &[seeds],
        )
    })
}

/// Pays the time-held reward owed since the last accrual into the pot.
/// Anything above the caps is forfeited.
pub fn accrue<'a>(
    token_program: &AccountInfo<'a>,
    vault: &AccountInfo<'a>,
    pot: &AccountInfo<'a>,
    crown: &AccountInfo<'a>,
    state: &mut Crown,
    now: i64,
) -> ProgramResult {
    let owed = state.pending_accrual(now);
    state.last_accrual = now;
    if owed == 0 {
        return Ok(());
    }

    let vault_balance = vault_balance(vault, crown.key, state)?;
    let pot_balance = pot_balance(pot, state)?;
    let amount = state.take_payout(now, owed, vault_balance, pot_balance);
    transfer_from_vault(token_program, vault, pot, crown, state, amount)
}
