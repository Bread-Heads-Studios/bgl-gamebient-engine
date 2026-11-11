use borsh::BorshDeserialize;
use mpl_core::{
    instructions::{CreateV2Cpi, CreateV2InstructionArgs},
    types::{
        Attribute, Attributes, DataState, PermanentFreezeDelegate, PermanentTransferDelegate,
        Plugin, PluginAuthority, PluginAuthorityPair,
    },
};
use mpl_utils::{
    assert_derivation, assert_owned_by, assert_signer, cmp_pubkeys, create_or_allocate_account_raw,
};
use shank::ShankType;
use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, program::invoke,
    program_error::ProgramError, program_pack::Pack, pubkey::Pubkey, sysvar::Sysvar,
};
use solana_system_interface::program as system_program;
use spl_associated_token_account::instruction::create_associated_token_account_idempotent;
use spl_token::state::Mint;

use crate::{
    error::BglGhostError,
    instruction::accounts::CreateCrownV1Accounts,
    processor::crown_utils::{assert_token_program, save_crown},
    state::{Crown, CrownConfig, ASSET_SIGNER_PREFIX, CROWN_ASSET_PREFIX, CROWN_KEY, CROWN_PREFIX},
};

#[repr(C)]
#[derive(PartialEq, Eq, Debug, Clone, ShankType, BorshDeserialize)]
pub struct CreateCrownV1Args {
    pub name: String,
    pub uri: String,
    pub season: u32,
    /// Score a player must beat to take the crown for the first time.
    pub min_score: u64,
    pub config: CrownConfig,
}

impl CreateCrownV1Args {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        // Skip the discriminator
        Self::try_from_slice(&input[1..]).map_err(|_| ProgramError::InvalidInstructionData)
    }

    pub fn check(&self) -> ProgramResult {
        if self.name.is_empty() || self.name.len() > 32 {
            return Err(BglGhostError::InvalidName.into());
        }
        if self.uri.is_empty() {
            return Err(BglGhostError::InvalidUri.into());
        }
        Ok(())
    }
}

pub struct CreateCrownBumps {
    crown: u8,
    asset: u8,
    asset_signer: u8,
}

impl CreateCrownV1Accounts<'_> {
    pub fn check(&self, args: &CreateCrownV1Args) -> Result<CreateCrownBumps, ProgramError> {
        let Self {
            crown,
            asset,
            asset_signer,
            game,
            reward_mint,
            vault: _,
            pot: _,
            authority,
            attestor: _,
            payer,
            mpl_core_program,
            token_program,
            associated_token_program,
            system_program,
        } = self;

        // Crown
        let crown_bump = assert_derivation(
            &crate::ID,
            crown,
            &[
                CROWN_PREFIX,
                authority.key.as_ref(),
                game.key.as_ref(),
                &args.season.to_le_bytes(),
            ],
            BglGhostError::InvalidCrownPdaDerivation,
        )?;

        // Asset
        let asset_bump = assert_derivation(
            &crate::ID,
            asset,
            &[CROWN_ASSET_PREFIX, crown.key.as_ref()],
            BglGhostError::InvalidCrownAssetPdaDerivation,
        )?;

        // Asset signer
        let asset_signer_bump = assert_derivation(
            &mpl_core::ID,
            asset_signer,
            &[ASSET_SIGNER_PREFIX, asset.key.as_ref()],
            BglGhostError::InvalidAssetSigner,
        )?;

        // Game, Attestor
        // SAFE: Recorded as-is; the authority chooses them.

        // Reward mint
        assert_owned_by(
            reward_mint,
            &spl_token::ID,
            BglGhostError::InvalidMintAccount,
        )?;
        if reward_mint.data_len() != Mint::LEN {
            return Err(BglGhostError::InvalidMintAccount.into());
        }

        // Vault, Pot
        // SAFE: Derived and checked by the Associated Token Program.

        // Authority
        assert_signer(authority).map_err(|_| BglGhostError::AuthorityMustSign)?;

        // Payer
        assert_signer(payer).map_err(|_| BglGhostError::PayerMustSign)?;

        // MPL Core Program
        if !cmp_pubkeys(mpl_core_program.key, &mpl_core::ID) {
            return Err(BglGhostError::InvalidMplCoreProgram.into());
        }

        // Token Program
        assert_token_program(token_program)?;

        // Associated Token Program
        if !cmp_pubkeys(
            associated_token_program.key,
            &spl_associated_token_account::ID,
        ) {
            return Err(BglGhostError::InvalidAssociatedTokenProgram.into());
        }

        // System Program
        if !cmp_pubkeys(system_program.key, &system_program::ID) {
            return Err(BglGhostError::InvalidSystemProgram.into());
        }

        Ok(CreateCrownBumps {
            crown: crown_bump,
            asset: asset_bump,
            asset_signer: asset_signer_bump,
        })
    }
}

pub fn create_crown<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = CreateCrownV1Accounts::context(accounts)?;

    let args = CreateCrownV1Args::unpack(args)?;
    args.check()?;
    let bumps = ctx.accounts.check(&args)?;

    let now = Clock::get()?.unix_timestamp;
    let season = args.season.to_le_bytes();
    let crown_seeds: &[&[u8]] = &[
        CROWN_PREFIX,
        ctx.accounts.authority.key.as_ref(),
        ctx.accounts.game.key.as_ref(),
        &season,
        &[bumps.crown],
    ];
    let asset_seeds: &[&[u8]] = &[
        CROWN_ASSET_PREFIX,
        ctx.accounts.crown.key.as_ref(),
        &[bumps.asset],
    ];

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/
    // Create the crown account
    create_or_allocate_account_raw(
        crate::ID,
        ctx.accounts.crown,
        ctx.accounts.system_program,
        ctx.accounts.payer,
        Crown::LEN,
        crown_seeds,
    )?;

    save_crown(
        ctx.accounts.crown,
        &Crown {
            authority: *ctx.accounts.authority.key,
            attestor: *ctx.accounts.attestor.key,
            game: *ctx.accounts.game.key,
            asset: *ctx.accounts.asset.key,
            reward_mint: *ctx.accounts.reward_mint.key,
            holder: Pubkey::default(),
            high_score: args.min_score,
            held_since: 0,
            last_accrual: now,
            config: args.config,
            window_start: now,
            window_paid: 0,
            season: args.season,
            key: CROWN_KEY,
            bump: bumps.crown,
            asset_signer_bump: bumps.asset_signer,
            is_active: 1,
        },
    )?;

    // Create the crown asset. It starts owned by the crown PDA and is frozen
    // for good; only the crown PDA can move it via the permanent transfer
    // delegate.
    let crown_authority = PluginAuthority::Address {
        address: *ctx.accounts.crown.key,
    };
    CreateV2Cpi {
        __program: ctx.accounts.mpl_core_program,
        asset: ctx.accounts.asset,
        collection: None,
        authority: None,
        payer: ctx.accounts.payer,
        owner: Some(ctx.accounts.crown),
        update_authority: Some(ctx.accounts.crown),
        system_program: ctx.accounts.system_program,
        log_wrapper: None,
        __args: CreateV2InstructionArgs {
            name: args.name,
            uri: args.uri,
            data_state: DataState::AccountState,
            plugins: Some(vec![
                PluginAuthorityPair {
                    plugin: Plugin::PermanentFreezeDelegate(PermanentFreezeDelegate {
                        frozen: true,
                    }),
                    authority: Some(crown_authority.clone()),
                },
                PluginAuthorityPair {
                    plugin: Plugin::PermanentTransferDelegate(PermanentTransferDelegate {}),
                    authority: Some(crown_authority),
                },
                PluginAuthorityPair {
                    plugin: Plugin::Attributes(Attributes {
                        attribute_list: crown_attributes(args.season, args.min_score),
                    }),
                    authority: None,
                },
            ]),
            external_plugin_adapters: None,
        },
    }
    .invoke_signed(&[asset_seeds, crown_seeds])?;

    // Create the reward vault (owned by the crown) and the pot (owned by the
    // crown asset's signer PDA).
    for (wallet, token_account) in [
        (ctx.accounts.crown, ctx.accounts.vault),
        (ctx.accounts.asset_signer, ctx.accounts.pot),
    ] {
        invoke(
            &create_associated_token_account_idempotent(
                ctx.accounts.payer.key,
                wallet.key,
                ctx.accounts.reward_mint.key,
                ctx.accounts.token_program.key,
            ),
            &[
                ctx.accounts.payer.clone(),
                token_account.clone(),
                wallet.clone(),
                ctx.accounts.reward_mint.clone(),
                ctx.accounts.system_program.clone(),
                ctx.accounts.token_program.clone(),
                ctx.accounts.associated_token_program.clone(),
            ],
        )?;
    }

    Ok(())
}

pub fn crown_attributes(season: u32, score: u64) -> Vec<Attribute> {
    vec![
        Attribute {
            key: "season".to_string(),
            value: season.to_string(),
        },
        Attribute {
            key: "high_score".to_string(),
            value: score.to_string(),
        },
    ]
}
