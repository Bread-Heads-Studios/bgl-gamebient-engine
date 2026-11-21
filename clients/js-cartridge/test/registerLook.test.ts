import { generateSigner, publicKey } from '@metaplex-foundation/umi';
import test from 'ava';
import {
  createCollection,
  fetchCollection,
} from '@metaplex-foundation/mpl-core';
import { CRUMBS_MINT, USDC_MINT, PriceType, readLookData } from '../src';
import {
  createUmi,
  LOOK_NAME,
  LOOK_URI,
  registerTestLook,
  releaseFreeGame,
} from './_setup';

test('it registers a USDC transfer look', async (t) => {
  const umi = await createUmi();
  const game = await releaseFreeGame(umi);
  const { builder, look, creator } = await registerTestLook(umi, game, {
    priceType: PriceType.Transfer,
    price: 1_500_000,
    mint: USDC_MINT,
  });
  await builder.sendAndConfirm(umi);

  const collection = await fetchCollection(umi, look);
  t.is(collection.name, LOOK_NAME);
  t.is(collection.uri, LOOK_URI);
  t.is(collection.updateAuthority, look);
  t.is(collection.numMinted, 0);
  const data = readLookData(collection.dataSections![0].data!);
  t.like(data, {
    version: 1,
    game: game.game,
    creator: creator.publicKey,
    priceType: PriceType.Transfer,
    price: 1_500_000n,
    paymentMint: USDC_MINT,
    lookVersion: 1,
    schema: 1,
    publisherBps: 0,
    protocolBps: 0,
  });
  t.deepEqual(data.contentHash, new Uint8Array(32).fill(7));
});

test('it registers a CRUMBS burn look', async (t) => {
  const umi = await createUmi();
  const game = await releaseFreeGame(umi);
  const { builder, look, creator } = await registerTestLook(umi, game, {
    lookId: 'crumbs-look',
    priceType: PriceType.Burn,
    price: 500,
    mint: CRUMBS_MINT,
  });
  await builder.sendAndConfirm(umi);

  const collection = await fetchCollection(umi, look);
  t.is(collection.updateAuthority, look);
  t.like(readLookData(collection.dataSections![0].data!), {
    version: 1,
    game: game.game,
    creator: creator.publicKey,
    priceType: PriceType.Burn,
    price: 500n,
    paymentMint: CRUMBS_MINT,
    lookVersion: 1,
  });
});

test('it rejects an invalid look id', async (t) => {
  const umi = await createUmi();
  const game = await releaseFreeGame(umi);
  const { builder } = await registerTestLook(umi, game, { lookId: 'Bad_Id' });
  await t.throwsAsync(builder.sendAndConfirm(umi), { name: 'InvalidLookId' });
});

test('it rejects a name longer than 32 bytes', async (t) => {
  const umi = await createUmi();
  const game = await releaseFreeGame(umi);
  const { builder } = await registerTestLook(umi, game, {
    name: 'a'.repeat(33),
  });
  await t.throwsAsync(builder.sendAndConfirm(umi), { name: 'InvalidName' });
});

test('it rejects an empty uri', async (t) => {
  const umi = await createUmi();
  const game = await releaseFreeGame(umi);
  const { builder } = await registerTestLook(umi, game, { uri: '' });
  await t.throwsAsync(builder.sendAndConfirm(umi), { name: 'InvalidUri' });
});

test('it rejects a revenue share', async (t) => {
  const umi = await createUmi();
  const game = await releaseFreeGame(umi);
  const { builder } = await registerTestLook(umi, game, { publisherBps: 1 });
  await t.throwsAsync(builder.sendAndConfirm(umi), {
    name: 'RevenueShareNotSupported',
  });
});

test('it rejects a USDC burn look', async (t) => {
  const umi = await createUmi();
  const game = await releaseFreeGame(umi);
  const { builder } = await registerTestLook(umi, game, {
    priceType: PriceType.Burn,
    mint: USDC_MINT,
  });
  await t.throwsAsync(builder.sendAndConfirm(umi), {
    name: 'BurnNotAllowedForMint',
  });
});

test('it rejects a game that is not at its game PDA', async (t) => {
  const umi = await createUmi();
  // A plain Core collection that is not derived from the claimed name/nonce.
  const fake = generateSigner(umi);
  await createCollection(umi, {
    collection: fake,
    name: 'made-up-game',
    uri: 'https://test-game.com',
  }).sendAndConfirm(umi);
  const { builder } = await registerTestLook(
    umi,
    { name: 'made-up-game', game: publicKey(fake.publicKey) },
    {}
  );
  await t.throwsAsync(builder.sendAndConfirm(umi), {
    name: 'InvalidGamePdaDerivation',
  });
});
