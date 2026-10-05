import {
  generateSigner,
  publicKey,
  transactionBuilder,
  Umi,
} from '@metaplex-foundation/umi';
import test from 'ava';
import { fetchAsset } from '@metaplex-foundation/mpl-core';
import {
  fetchToken,
  findAssociatedTokenPda,
} from '@metaplex-foundation/mpl-toolbox';
import {
  Currency,
  findGamePda,
  LOCALNET_USDC_MINT,
  PriceType,
  printGameCartridgeV1,
  releaseGameV1,
  updateGamePriceV1,
} from '../src';
import { createUmi, ensureLocalnetUsdcMint, fundUsdc } from './_setup';

const FIVE_USDC = 5_000_000;

/** Releases a free (in CRUMBS) game, optionally with a USDC price. */
const releaseWithUsdc = async (
  umi: Umi,
  usdcPrice: number
): Promise<{ game: ReturnType<typeof publicKey>; gameBump: number }> => {
  const name = Math.random().toString(36).substring(2, 15);
  const [game, gameBump] = findGamePda(umi, { name, nonce: 0 });

  await releaseGameV1(umi, {
    name,
    uri: 'https://test-game.com',
    priceType: PriceType.Burn,
    price: 0,
  }).sendAndConfirm(umi);

  await updateGamePriceV1(umi, {
    game: publicKey(game),
    usdcMint: LOCALNET_USDC_MINT,
    collectionNonce: 0,
    collectionBump: gameBump,
    priceType: PriceType.Burn,
    price: 0,
    usdcPrice,
  }).sendAndConfirm(umi);

  return { game: publicKey(game), gameBump };
};

const usdcAccounts = (umi: Umi, game: ReturnType<typeof publicKey>) => ({
  currency: Currency.Usdc,
  paymentMint: LOCALNET_USDC_MINT,
  gameTokenAccount: findAssociatedTokenPda(umi, {
    mint: LOCALNET_USDC_MINT,
    owner: game,
  }),
  payerTokenAccount: findAssociatedTokenPda(umi, {
    mint: LOCALNET_USDC_MINT,
    owner: umi.identity.publicKey,
  }),
});

test('a cartridge can be paid for in USDC', async (t) => {
  const umi = await createUmi();
  await ensureLocalnetUsdcMint(umi);
  const { game, gameBump } = await releaseWithUsdc(umi, FIVE_USDC);
  const payerUsdc = await fundUsdc(umi, umi.identity.publicKey, 2 * FIVE_USDC);
  const cartridge = generateSigner(umi);

  await printGameCartridgeV1(umi, {
    game,
    cartridge,
    owner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump: gameBump,
    ...usdcAccounts(umi, game),
  }).sendAndConfirm(umi);

  // The cartridge exists and the USDC moved to the game's USDC account.
  const asset = await fetchAsset(umi, cartridge.publicKey);
  t.is(asset.owner, umi.identity.publicKey);
  const gameUsdc = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, { mint: LOCALNET_USDC_MINT, owner: game })
  );
  t.is(gameUsdc.amount, BigInt(FIVE_USDC));
  t.is((await fetchToken(umi, payerUsdc)).amount, BigInt(FIVE_USDC));
});

test('a game with a USDC price can still be bought with CRUMBS', async (t) => {
  const umi = await createUmi();
  await ensureLocalnetUsdcMint(umi);
  const { game, gameBump } = await releaseWithUsdc(umi, FIVE_USDC);
  const cartridge = generateSigner(umi);

  await printGameCartridgeV1(umi, {
    game,
    cartridge,
    owner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump: gameBump,
  }).sendAndConfirm(umi);

  t.is(
    (await fetchAsset(umi, cartridge.publicKey)).owner,
    umi.identity.publicKey
  );
});

test('it rejects USDC for a game whose USDC price was turned off', async (t) => {
  const umi = await createUmi();
  await ensureLocalnetUsdcMint(umi);
  const { game, gameBump } = await releaseWithUsdc(umi, FIVE_USDC);
  await updateGamePriceV1(umi, {
    game,
    usdcMint: LOCALNET_USDC_MINT,
    collectionNonce: 0,
    collectionBump: gameBump,
    priceType: PriceType.Burn,
    price: 0,
    usdcPrice: 0,
  }).sendAndConfirm(umi);
  await fundUsdc(umi, umi.identity.publicKey, FIVE_USDC);

  const promise = printGameCartridgeV1(umi, {
    game,
    cartridge: generateSigner(umi),
    owner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump: gameBump,
    ...usdcAccounts(umi, game),
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { name: 'UsdcNotAccepted' });
});

test('it rejects USDC when the payment mint is not USDC', async (t) => {
  const umi = await createUmi();
  await ensureLocalnetUsdcMint(umi);
  const { game, gameBump } = await releaseWithUsdc(umi, FIVE_USDC);

  // Currency says USDC but every payment account is the CRUMBS default.
  const promise = printGameCartridgeV1(umi, {
    game,
    cartridge: generateSigner(umi),
    owner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump: gameBump,
    currency: Currency.Usdc,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { name: 'InvalidUsdcMint' });
});

test('clients that omit the currency byte still pay in CRUMBS', async (t) => {
  const umi = await createUmi();
  const { game, gameBump } = await releaseWithUsdc(umi, FIVE_USDC);
  const cartridge = generateSigner(umi);

  // The pre-USDC wire format: discriminator, nonce, bump and nothing else.
  const [item] = printGameCartridgeV1(umi, {
    game,
    cartridge,
    owner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump: gameBump,
  }).items;
  const legacy = {
    ...item,
    instruction: {
      ...item.instruction,
      data: item.instruction.data.slice(0, 3),
    },
  };
  await transactionBuilder([legacy]).sendAndConfirm(umi);

  t.is(
    (await fetchAsset(umi, cartridge.publicKey)).owner,
    umi.identity.publicKey
  );
});
