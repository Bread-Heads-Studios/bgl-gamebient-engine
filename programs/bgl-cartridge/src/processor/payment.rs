use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult, program::invoke};

use crate::state::PriceType;

/// The accounts a payment step touches. `payee_token_account` is only used
/// for a Transfer, `payment_mint` only for a Burn.
pub(crate) struct Payment<'a, 'b> {
    pub token_program: &'b AccountInfo<'a>,
    pub payer: &'b AccountInfo<'a>,
    pub payer_token_account: &'b AccountInfo<'a>,
    pub payee_token_account: &'b AccountInfo<'a>,
    pub payment_mint: &'b AccountInfo<'a>,
}

/// Transfer the payment to the payee, or burn it from the payer, with the
/// payer as signer.
pub(crate) fn take_payment(p: &Payment, price_type: PriceType, amount: u64) -> ProgramResult {
    match price_type {
        PriceType::Transfer => invoke(
            &spl_token::instruction::transfer(
                p.token_program.key,
                p.payer_token_account.key,
                p.payee_token_account.key,
                p.payer.key,
                &[],
                amount,
            )?,
            &[
                p.payer_token_account.clone(),
                p.payee_token_account.clone(),
                p.payer.clone(),
            ],
        ),
        PriceType::Burn => invoke(
            &spl_token::instruction::burn(
                p.token_program.key,
                p.payer_token_account.key,
                p.payment_mint.key,
                p.payer.key,
                &[],
                amount,
            )?,
            &[
                p.payer_token_account.clone(),
                p.payment_mint.clone(),
                p.payer.clone(),
            ],
        ),
    }
}
