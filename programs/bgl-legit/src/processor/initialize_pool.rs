use bytemuck::{from_bytes, from_bytes_mut, Pod, Zeroable};
use mpl_utils::{
    assert_derivation, assert_owned_by, assert_signer, cmp_pubkeys, create_or_allocate_account_raw,
};
use shank::{ShankAccounts, ShankType};
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program::invoke,
    program_error::ProgramError, program_pack::Pack, system_program,
};
use spl_associated_token_account::instruction::create_associated_token_account_idempotent;
use spl_token::state::Mint;

use crate::{
    error::BglLegitError,
    state::{StakingConfig, StakingPool, POOL_PREFIX},
};

#[repr(C)]
#[derive(PartialEq, Eq, Debug, Clone, ShankType, Pod, Zeroable, Copy)]
pub struct InitializePoolV1Args {
    #[skip]
    /// The discriminator for the instruction
    discriminator: u8,

    /// Padding for 8-byte alignment
    _padding: [u8; 7],

    /// Staking configuration for machine owners
    pub machine_owner_config: StakingConfig,

    /// Staking configuration for game creators
    pub game_creator_config: StakingConfig,
}

#[derive(ShankAccounts)]
pub struct InitializePoolV1Accounts<'a> {
    #[account(writable, desc = "The staking pool account")]
    pool: &'a AccountInfo<'a>,

    #[account(desc = "The token mint for staking")]
    mint: &'a AccountInfo<'a>,

    #[account(signer, desc = "The authority of the pool")]
    authority: &'a AccountInfo<'a>,

    #[account(writable, signer, desc = "The account paying for storage fees")]
    payer: &'a AccountInfo<'a>,

    #[account(writable, desc = "The pool's associated token account")]
    pool_token_account: &'a AccountInfo<'a>,

    #[account(desc = "The SPL Token program")]
    token_program: &'a AccountInfo<'a>,

    #[account(desc = "The Associated Token Program")]
    associated_token_program: &'a AccountInfo<'a>,

    #[account(desc = "The system program")]
    system_program: &'a AccountInfo<'a>,
}

impl InitializePoolV1Accounts<'_> {
    pub fn check(&self) -> Result<u8, ProgramError> {
        let Self {
            pool,
            mint,
            authority,
            payer,
            pool_token_account,
            token_program,
            associated_token_program,
            system_program,
        } = self;

        // Pool
        let bump = assert_derivation(
            &crate::ID,
            pool,
            &[POOL_PREFIX, authority.key.as_ref(), mint.key.as_ref()],
            BglLegitError::InvalidPoolPdaDerivation,
        )?;

        // Mint
        assert_owned_by(mint, &spl_token::ID, BglLegitError::InvalidMintAccount)?;
        if mint.data_len() != Mint::LEN {
            return Err(BglLegitError::InvalidMintAccount.into());
        }

        // Authority
        assert_signer(authority).map_err(|_| BglLegitError::AuthorityMustSign)?;

        // Payer
        assert_signer(payer).map_err(|_| BglLegitError::PayerMustSign)?;

        // Token Program
        if !cmp_pubkeys(token_program.key, &spl_token::ID) {
            return Err(BglLegitError::InvalidSplTokenProgram.into());
        }

        // Associated Token Program
        if !cmp_pubkeys(
            associated_token_program.key,
            &spl_associated_token_account::ID,
        ) {
            return Err(BglLegitError::InvalidAssociatedTokenProgram.into());
        }

        // System Program
        if !cmp_pubkeys(system_program.key, &system_program::ID) {
            return Err(BglLegitError::InvalidSystemProgram.into());
        }

        Ok(bump)
    }
}

pub fn initialize_pool<'a>(
    accounts: &'a [AccountInfo<'a>],
    instruction_data: &[u8],
) -> ProgramResult {
    let ctx = InitializePoolV1Accounts::context(accounts);
    let args: &InitializePoolV1Args = from_bytes(instruction_data);

    let pool_bump = ctx.accounts.check()?;

    // TODO: Validate reward rates are reasonable
    // TODO: Validate lockup periods are reasonable

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/
    // Create the pool account with proper PDA derivation
    create_or_allocate_account_raw(
        crate::ID,
        ctx.accounts.pool,
        ctx.accounts.system_program,
        ctx.accounts.payer,
        core::mem::size_of::<StakingPool>(),
        &[
            POOL_PREFIX,
            ctx.accounts.authority.key.as_ref(),
            ctx.accounts.mint.key.as_ref(),
            &[pool_bump],
        ],
    )?;

    let mut pool_data = ctx.accounts.pool.try_borrow_mut_data()?;
    let pool: &mut StakingPool = from_bytes_mut(&mut pool_data);

    // Initialize the StakingPool state with provided parameters
    pool.initialize(
        *ctx.accounts.authority.key,
        *ctx.accounts.mint.key,
        args.machine_owner_config,
        args.game_creator_config,
    );

    drop(pool_data);

    // Create the vault token account
    invoke(
        &create_associated_token_account_idempotent(
            ctx.accounts.payer.key,
            ctx.accounts.pool.key,
            ctx.accounts.mint.key,
            ctx.accounts.token_program.key,
        ),
        &[
            ctx.accounts.payer.clone(),
            ctx.accounts.pool.clone(),
            ctx.accounts.mint.clone(),
            ctx.accounts.system_program.clone(),
            ctx.accounts.token_program.clone(),
            ctx.accounts.associated_token_program.clone(),
            ctx.accounts.pool_token_account.clone(),
        ],
    )?;

    Ok(())
}
