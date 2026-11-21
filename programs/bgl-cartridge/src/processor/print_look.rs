use borsh::{BorshDeserialize, BorshSerialize};
use mpl_core::{
    accounts::{BaseAssetV1, BaseCollectionV1},
    instructions::{CreateV2Cpi, CreateV2InstructionArgs},
    types::{
        DataState, Edition, Key, PermanentFreezeDelegate, Plugin, PluginAuthority,
        PluginAuthorityPair, UpdateAuthority,
    },
};
use mpl_utils::{assert_owned_by, assert_signer, cmp_pubkeys};
use shank::ShankType;
use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError,
    program_pack::Pack,
};
use solana_system_interface::program as system_program;
use spl_token::state::Account as SplTokenAccount;

use super::payment::{take_payment, Payment};
use crate::{
    error::BglCartridgeError,
    instruction::accounts::PrintLookV1Accounts,
    state::{
        find_asset_signer, is_look_id, look_pda, read_look_data, validate_payment, LookData,
        PriceType, LOOK_PREFIX,
    },
};

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Eq, Debug, Clone, ShankType)]
pub struct PrintLookV1Args {
    /// The look id the PDA was derived with. Not stored in `LookData`.
    pub look_id: String,
}

impl PrintLookV1Args {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        // Skip the discriminator. Borsh rejects trailing bytes.
        Self::try_from_slice(input.get(1..).ok_or(ProgramError::InvalidInstructionData)?)
            .map_err(|_| ProgramError::InvalidInstructionData)
    }
}

impl PrintLookV1Accounts<'_> {
    /// Every guard runs here, before any CPI. Returns the look PDA bump.
    pub fn check(
        &self,
        args: &PrintLookV1Args,
        data: &LookData,
        price_type: PriceType,
    ) -> Result<u8, ProgramError> {
        let Self {
            copy: _copy,
            look,
            cartridge,
            owner,
            recipient,
            creator_token_account,
            payer,
            payer_token_account,
            payment_mint,
            mpl_core_program,
            token_program,
            system_program,
        } = self;

        // Copy
        // SAFE: New asset; Core requires it to be an empty signer.

        // Look — must sit at the PDA its stored game and creator imply. The
        // id is checked first so an over-long id cannot break the derivation.
        if !is_look_id(&args.look_id) {
            return Err(BglCartridgeError::InvalidLookId.into());
        }
        let (expected, bump) = look_pda(&data.game, &data.creator, &args.look_id);
        if !cmp_pubkeys(look.key, &expected) {
            return Err(BglCartridgeError::InvalidLookPdaDerivation.into());
        }

        // Cartridge — a Core asset in the look's game, owned by `owner`.
        assert_owned_by(
            cartridge,
            &mpl_core::ID,
            BglCartridgeError::CartridgeNotInGame,
        )?;
        let asset = BaseAssetV1::from_bytes(cartridge.try_borrow_data()?.as_ref())
            .map_err(|_| BglCartridgeError::CartridgeNotInGame)?;
        if asset.key != Key::AssetV1
            || asset.update_authority != UpdateAuthority::Collection(data.game)
        {
            return Err(BglCartridgeError::CartridgeNotInGame.into());
        }

        // Owner — the cartridge owner co-signs.
        if !cmp_pubkeys(&asset.owner, owner.key) {
            return Err(BglCartridgeError::NotCartridgeOwner.into());
        }
        assert_signer(owner).map_err(|_| BglCartridgeError::NotCartridgeOwner)?;

        // Recipient — the cartridge's asset signer PDA.
        if !cmp_pubkeys(recipient.key, &find_asset_signer(cartridge.key)) {
            return Err(BglCartridgeError::InvalidAssetSigner.into());
        }

        // The look's stored mint decides every token check below.
        validate_payment(&data.payment_mint, price_type)?;

        // Creator Token Account — where a Transfer payment lands. Unused for
        // a Burn, so any account is accepted there.
        if price_type == PriceType::Transfer {
            assert_owned_by(
                creator_token_account,
                &spl_token::ID,
                BglCartridgeError::InvalidCreatorTokenAccount,
            )?;
            let token_account =
                SplTokenAccount::unpack(creator_token_account.try_borrow_data()?.as_ref())
                    .map_err(|_| BglCartridgeError::InvalidCreatorTokenAccount)?;
            if token_account.owner != data.creator || token_account.mint != data.payment_mint {
                return Err(BglCartridgeError::InvalidCreatorTokenAccount.into());
            }
        }

        // Payer
        assert_signer(payer).map_err(|_| BglCartridgeError::PayerMustSign)?;

        // Payer Token Account
        assert_owned_by(
            payer_token_account,
            &spl_token::ID,
            BglCartridgeError::InvalidPayerTokenAccountProgramOwner,
        )?;
        let token_account =
            SplTokenAccount::unpack(payer_token_account.try_borrow_data()?.as_ref())?;
        if token_account.owner != *payer.key {
            return Err(BglCartridgeError::InvalidPayerTokenAccountOwner.into());
        }
        if token_account.mint != data.payment_mint {
            return Err(BglCartridgeError::InvalidPayerTokenAccountMint.into());
        }

        // Payment Mint
        if !cmp_pubkeys(payment_mint.key, &data.payment_mint) {
            return Err(BglCartridgeError::InvalidPaymentMint.into());
        }

        // MPL Core Program
        if !cmp_pubkeys(mpl_core_program.key, &mpl_core::ID) {
            return Err(BglCartridgeError::InvalidMplCoreProgram.into());
        }

        // Token Program
        if !cmp_pubkeys(token_program.key, &spl_token::ID) {
            return Err(BglCartridgeError::InvalidTokenProgram.into());
        }

        // System Program
        if !cmp_pubkeys(system_program.key, &system_program::ID) {
            return Err(BglCartridgeError::InvalidSystemProgram.into());
        }

        Ok(bump)
    }
}

/// Print a frozen Edition copy of a look into a cartridge's asset signer. The
/// cartridge owner co-signs; the payer pays the look's creator or burns.
pub fn print_look<'a>(accounts: &'a [AccountInfo<'a>], args: &[u8]) -> ProgramResult {
    let ctx = PrintLookV1Accounts::context(accounts)?;

    let args = PrintLookV1Args::unpack(args)?;

    // The account checks depend on the look's data, so read it first.
    let data = read_look_data(ctx.accounts.look)?;
    let price_type = match data.price_type {
        0 => PriceType::Transfer,
        1 => PriceType::Burn,
        _ => return Err(BglCartridgeError::InvalidLookData.into()),
    };

    let bump = ctx.accounts.check(&args, &data, price_type)?;

    /*********************************************/
    /****************** Actions ******************/
    /*********************************************/
    take_payment(
        &Payment {
            token_program: ctx.accounts.token_program,
            payer: ctx.accounts.payer,
            payer_token_account: ctx.accounts.payer_token_account,
            payee_token_account: ctx.accounts.creator_token_account,
            payment_mint: ctx.accounts.payment_mint,
        },
        price_type,
        data.price,
    )?;

    // The edition number is the look's mint count plus one.
    let collection = BaseCollectionV1::from_bytes(ctx.accounts.look.try_borrow_data()?.as_ref())?;
    let number = collection.num_minted + 1;

    CreateV2Cpi {
        __program: ctx.accounts.mpl_core_program,
        asset: ctx.accounts.copy,
        collection: Some(ctx.accounts.look),
        owner: Some(ctx.accounts.recipient),
        authority: Some(ctx.accounts.look),
        update_authority: None,
        payer: ctx.accounts.payer,
        system_program: ctx.accounts.system_program,
        log_wrapper: None,
        __args: CreateV2InstructionArgs {
            name: format!("{} {}", collection.name, number),
            uri: collection.uri,
            data_state: DataState::AccountState,
            plugins: Some(vec![
                PluginAuthorityPair {
                    plugin: Plugin::Edition(Edition { number }),
                    authority: None,
                },
                PluginAuthorityPair {
                    plugin: Plugin::PermanentFreezeDelegate(PermanentFreezeDelegate {
                        frozen: true,
                    }),
                    authority: Some(PluginAuthority::UpdateAuthority),
                },
            ]),
            external_plugin_adapters: None,
        },
    }
    .invoke_signed(&[&[
        LOOK_PREFIX,
        data.game.as_ref(),
        data.creator.as_ref(),
        args.look_id.as_bytes(),
        &[bump],
    ]])?;

    Ok(())
}
