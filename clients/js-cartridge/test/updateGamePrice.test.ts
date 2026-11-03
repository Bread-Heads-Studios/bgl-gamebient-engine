import { generateSigner, publicKey, Umi } from '@metaplex-foundation/umi';
import test from 'ava';
import { fetchCollection } from '@metaplex-foundation/mpl-core';
import {
  findGamePda,
  CRUMBS_MINT,
  USDC_MINT,
  readGameCollectionData,
  PriceType,
  releaseGameV1,
  updateGamePriceV1,
} from '../src';
import { createUmi } from './_setup';

const release = async (
  umi: Umi
): Promise<{ game: ReturnType<typeof publicKey>; gameBump: number }> => {
  const name = Math.random().toString(36).substring(2, 15);
  const [game, gameBump] = findGamePda(umi, { name, nonce: 0 });

  await releaseGameV1(umi, {
    name,
    uri: 'https://test-game.com',
    priceType: PriceType.Transfer,
    price: 100,
  }).sendAndConfirm(umi);

  return { game: publicKey(game), gameBump };
};

const gameData = async (umi: Umi, game: ReturnType<typeof publicKey>) => {
  const collection = await fetchCollection(umi, game);
  return readGameCollectionData(collection.dataSections![0].data!);
};

test('the publisher can update the price of a game', async (t) => {
  const umi = await createUmi();
  const { game, gameBump } = await release(umi);

  await updateGamePriceV1(umi, {
    game,
    collectionNonce: 0,
    collectionBump: gameBump,
    priceType: PriceType.Transfer,
    price: 250,
    paymentMint: CRUMBS_MINT,
  }).sendAndConfirm(umi);

  t.like(await gameData(umi, game), {
    version: 1,
    priceType: PriceType.Transfer,
    price: 250n,
    publisher: umi.identity.publicKey,
    paymentMint: CRUMBS_MINT,
  });
});

test('the publisher can change the payment type of a game', async (t) => {
  const umi = await createUmi();
  const { game, gameBump } = await release(umi);

  await updateGamePriceV1(umi, {
    game,
    collectionNonce: 0,
    collectionBump: gameBump,
    priceType: PriceType.Burn,
    price: 100,
    paymentMint: CRUMBS_MINT,
  }).sendAndConfirm(umi);

  t.like(await gameData(umi, game), {
    version: 1,
    priceType: PriceType.Burn,
    price: 100n,
    publisher: umi.identity.publicKey,
    paymentMint: CRUMBS_MINT,
  });
});

test('the publisher can make a game free', async (t) => {
  const umi = await createUmi();
  const { game, gameBump } = await release(umi);

  await updateGamePriceV1(umi, {
    game,
    collectionNonce: 0,
    collectionBump: gameBump,
    priceType: PriceType.Burn,
    price: 0,
    paymentMint: CRUMBS_MINT,
  }).sendAndConfirm(umi);

  t.like(await gameData(umi, game), {
    version: 1,
    priceType: PriceType.Burn,
    price: 0n,
    publisher: umi.identity.publicKey,
    paymentMint: CRUMBS_MINT,
  });
});

test('it rejects a signer that is not the publisher', async (t) => {
  const umi = await createUmi();
  const imposter = generateSigner(umi);
  const { game, gameBump } = await release(umi);

  const promise = updateGamePriceV1(umi, {
    game,
    authority: imposter,
    collectionNonce: 0,
    collectionBump: gameBump,
    priceType: PriceType.Burn,
    price: 1,
    paymentMint: CRUMBS_MINT,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { name: 'InvalidPublisher' });

  // And the game data is unchanged.
  t.like(await gameData(umi, game), {
    version: 1,
    priceType: PriceType.Transfer,
    price: 100n,
    publisher: umi.identity.publicKey,
    paymentMint: CRUMBS_MINT,
  });
});

test('it rejects a wrong collection nonce', async (t) => {
  const umi = await createUmi();
  const { game, gameBump } = await release(umi);

  const promise = updateGamePriceV1(umi, {
    game,
    collectionNonce: 1,
    collectionBump: gameBump,
    priceType: PriceType.Burn,
    price: 1,
    paymentMint: CRUMBS_MINT,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { name: 'InvalidGamePdaDerivation' });
});

test('the publisher can reprice a game to USDC', async (t) => {
  const umi = await createUmi();
  const { game, gameBump } = await release(umi);

  await updateGamePriceV1(umi, {
    game,
    collectionNonce: 0,
    collectionBump: gameBump,
    priceType: PriceType.Transfer,
    price: 2_990_000,
    paymentMint: USDC_MINT,
  }).sendAndConfirm(umi);

  t.like(await gameData(umi, game), {
    version: 1,
    priceType: PriceType.Transfer,
    price: 2_990_000n,
    paymentMint: USDC_MINT,
    publisher: umi.identity.publicKey,
  });
});

test('it rejects USDC with Burn', async (t) => {
  const umi = await createUmi();
  const { game, gameBump } = await release(umi);
  const promise = updateGamePriceV1(umi, {
    game,
    collectionNonce: 0,
    collectionBump: gameBump,
    priceType: PriceType.Burn,
    price: 2_990_000,
    paymentMint: USDC_MINT,
  }).sendAndConfirm(umi);
  await t.throwsAsync(promise, { name: 'BurnNotAllowedForMint' });
});

test('it rejects a mint that is not CRUMBS or USDC', async (t) => {
  const umi = await createUmi();
  const { game, gameBump } = await release(umi);
  const promise = updateGamePriceV1(umi, {
    game,
    collectionNonce: 0,
    collectionBump: gameBump,
    priceType: PriceType.Transfer,
    price: 1,
    paymentMint: generateSigner(umi).publicKey,
  }).sendAndConfirm(umi);
  await t.throwsAsync(promise, { name: 'InvalidPaymentMint' });
});
