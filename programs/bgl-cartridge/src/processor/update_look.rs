use borsh::{BorshDeserialize, BorshSerialize};
use mpl_core::{
    instructions::{
        UpdateCollectionV1Cpi, UpdateCollectionV1InstructionArgs,
        WriteCollectionExternalPluginAdapterDataV1Cpi,
        WriteCollectionExternalPluginAdapterDataV1InstructionArgs,
    },
    types::{ExternalPluginAdapterKey, PluginAuthority},
};
use mpl_utils::{assert_signer, cmp_pubkeys};
use shank::ShankType;
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError,
    pubkey::Pubkey,
};
use solana_system_interface::program as system_program;

use crate::{
    error::BglCartridgeError,
    instruction::accounts::UpdateLookV1Accounts,
    state::{
        is_look_id, look_pda, read_look_data, validate_payment, LookData, PriceType, LOOK_PREFIX,
    },
};

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Eq, Debug, Clone, ShankType)]
pub struct UpdateLookV1Args {
    /// The look id the PDA was derived with. Not stored in `LookData`.
    pub look_id: String,
    /// New look collection metadata URI, 1-200 bytes.
    pub uri: Option<String>,
    /// New hash of the look pack contents.
    pub content_hash: Option<[u8; 32]>,
    pub price_type: Option<PriceType>,
    /// New price in base units of the payment mint.
    pub price: Option<u64>,
    /// New payment mint: CRUMBS_MINT or USDC_MINT.
    pub payment_mint_choice: Option<Pubkey>,
}

impl UpdateLookV1Args {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        // Skip the discriminator. Borsh rejects out-of-range price types and
        // trailing bytes.
        Self::try_from_slice(input.get(1..).ok_or(ProgramError::InvalidInstructionData)?)
            .map_err(|_| ProgramError::InvalidInstructionData)
    }

    /// Checks that do not need the look's current data.
    pub fn check(&self) -> ProgramResult {
        if self.uri.is_none()
            && self.content_hash.is_none()
            && self.price_type.is_none()
            && self.price.is_none()
            && self.payment_mint_choice.is_none()
        {
            return Err(BglCartridgeError::InvalidLookData.into());
        }
        if let Some(uri) = &self.uri {
            if uri.is_empty() || uri.len() > 200 {
                return Err(BglCartridgeError::InvalidUri.into());
            }
        }
        Ok(())
    }
}

impl UpdateLookV1Accounts<'_> {
    pub fn check(&self) -> ProgramResult {
        let Self {
            look: _,
            creator,
            payer,
            mpl_core_program,
            system_program,
        } = self;

        // Creator
        assert_signer(creator).map_err(|_| BglCartridgeError::AuthorityMustSign)?;

        // Payer
        assert_signer(payer).map_err(|_| BglCartridgeError::PayerMustSign)?;

        // MPL Core Program
        if !cmp_pubkeys(mpl_core_program.key, &mpl_core::ID) {
            return Err(BglCartridgeError::InvalidMplCoreProgram.into());
        }

        // System Program
        if !cmp_pubkeys(system_program.key, &system_program::ID) {
            return Err(BglCartridgeError::InvalidSystemProgram.into());
        }

        Ok(())
    }
}

/// Update a look's uri, content hash and/or price. Only the creator recorded
/// at registration may call this. Bumps `look_version`.
pub fn update_look<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = UpdateLookV1Accounts::context(accounts)?;

    let args = UpdateLookV1Args::unpack(args)?;
    args.check()?;
    ctx.accounts.check()?;

    let look = ctx.accounts.look;
    let data = read_look_data(look)?;

    // The look must sit at the PDA its stored game and creator imply. The id
    // is checked first so an over-long id cannot break the derivation.
    if !is_look_id(&args.look_id) {
        return Err(BglCartridgeError::InvalidLookId.into());
    }
    let (expected, bump) = look_pda(&data.game, &data.creator, &args.look_id);
    if !cmp_pubkeys(look.key, &expected) {
        return Err(BglCartridgeError::InvalidLookPdaDerivation.into());
    }

    if !cmp_pubkeys(ctx.accounts.creator.key, &data.creator) {
        return Err(BglCartridgeError::NotLookCreator.into());
    }

    // Merge the update over the stored data and validate the payment pair.
    let current_price_type = match data.price_type {
        0 => PriceType::Transfer,
        1 => PriceType::Burn,
        _ => return Err(BglCartridgeError::InvalidLookData.into()),
    };
    let price_type = args.price_type.unwrap_or(current_price_type);
    let payment_mint = args.payment_mint_choice.unwrap_or(data.payment_mint);
    validate_payment(&payment_mint, price_type)?;

    let new_data = LookData {
        price_type: price_type as u8,
        price: args.price.unwrap_or(data.price),
        payment_mint,
        content_hash: args.content_hash.unwrap_or(data.content_hash),
        look_version: data
            .look_version
            .checked_add(1)
            .ok_or(BglCartridgeError::InvalidLookData)?,
        ..data
    };

    let signer_seeds: &[&[u8]] = &[
        LOOK_PREFIX,
        data.game.as_ref(),
        data.creator.as_ref(),
        args.look_id.as_bytes(),
        &[bump],
    ];

    if let Some(uri) = args.uri {
        UpdateCollectionV1Cpi {
            __program: ctx.accounts.mpl_core_program,
            collection: look,
            payer: ctx.accounts.payer,
            authority: Some(look),
            new_update_authority: None,
            system_program: ctx.accounts.system_program,
            log_wrapper: None,
            __args: UpdateCollectionV1InstructionArgs {
                new_name: None,
                new_uri: Some(uri),
            },
        }
        .invoke_signed(&[signer_seeds])?;
    }

    WriteCollectionExternalPluginAdapterDataV1Cpi {
        __program: ctx.accounts.mpl_core_program,
        collection: look,
        payer: ctx.accounts.payer,
        authority: Some(look),
        buffer: None,
        system_program: ctx.accounts.system_program,
        log_wrapper: None,
        __args: WriteCollectionExternalPluginAdapterDataV1InstructionArgs {
            key: ExternalPluginAdapterKey::LinkedAppData(PluginAuthority::UpdateAuthority),
            data: Some(borsh::to_vec(&new_data)?),
        },
    }
    .invoke_signed(&[signer_seeds])?;

    Ok(())
}
