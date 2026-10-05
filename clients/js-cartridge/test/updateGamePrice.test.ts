import { generateSigner, publicKey, Umi } from '@metaplex-foundation/umi';
import test from 'ava';
import {
  DataSectionPlugin,
  fetchCollection,
} from '@metaplex-foundation/mpl-core';
import {
  fetchToken,
  findAssociatedTokenPda,
} from '@metaplex-foundation/mpl-toolbox';
import {
  deserializeGameCollectionData,
  findGamePda,
  getGameCollectionDataV1Serializer,
  LOCALNET_USDC_MINT,
  PAYMENT_TOKEN_MINT,
  PriceType,
  releaseGameV1,
  updateGamePriceV1,
} from '../src';
import { createUmi, ensureLocalnetUsdcMint } from './_setup';

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

const expectedData = (
  umi: Umi,
  priceType: PriceType,
  price: number,
  usdcPrice = 0
): DataSectionPlugin[] => {
  const data = getGameCollectionDataV1Serializer().serialize({
    version: 1,
    priceType,
    price,
    publisher: umi.identity.publicKey,
    usdcPrice,
  });
  return <DataSectionPlugin[]>[
    {
      type: 'DataSection',
      parentKey: {
        type: 'LinkedAppData',
        dataAuthority: { type: 'UpdateAuthority' },
      },
      data,
    },
  ];
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
  }).sendAndConfirm(umi);

  const collection = await fetchCollection(umi, game);
  t.like(collection.dataSections, expectedData(umi, PriceType.Transfer, 250));
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
  }).sendAndConfirm(umi);

  const collection = await fetchCollection(umi, game);
  t.like(collection.dataSections, expectedData(umi, PriceType.Burn, 100));
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
  }).sendAndConfirm(umi);

  const collection = await fetchCollection(umi, game);
  t.like(collection.dataSections, expectedData(umi, PriceType.Burn, 0));
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
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { name: 'InvalidPublisher' });

  // And the game data is unchanged.
  const collection = await fetchCollection(umi, game);
  t.like(collection.dataSections, expectedData(umi, PriceType.Transfer, 100));
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
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { name: 'InvalidGamePdaDerivation' });
});

test('the publisher can add a USDC price, which creates the game USDC account', async (t) => {
  const umi = await createUmi();
  const usdcMint = (await ensureLocalnetUsdcMint(umi)).publicKey;
  const { game, gameBump } = await release(umi);

  await updateGamePriceV1(umi, {
    game,
    usdcMint,
    collectionNonce: 0,
    collectionBump: gameBump,
    priceType: PriceType.Transfer,
    price: 100,
    usdcPrice: 5_000_000, // 5 USDC
  }).sendAndConfirm(umi);

  const collection = await fetchCollection(umi, game);
  t.like(
    collection.dataSections,
    expectedData(umi, PriceType.Transfer, 100, 5_000_000)
  );
  t.like(deserializeGameCollectionData(collection.dataSections![0].data), {
    version: 1,
    price: 100n,
    usdcPrice: 5_000_000n,
  });

  // And the game now has a USDC token account to receive payments.
  const gameUsdc = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, { mint: usdcMint, owner: game })
  );
  t.like(gameUsdc, { mint: usdcMint, owner: game, amount: 0n });
});

test('the publisher can turn USDC back off', async (t) => {
  const umi = await createUmi();
  const usdcMint = (await ensureLocalnetUsdcMint(umi)).publicKey;
  const { game, gameBump } = await release(umi);

  await updateGamePriceV1(umi, {
    game,
    usdcMint,
    collectionNonce: 0,
    collectionBump: gameBump,
    priceType: PriceType.Transfer,
    price: 100,
    usdcPrice: 5_000_000,
  }).sendAndConfirm(umi);

  await updateGamePriceV1(umi, {
    game,
    usdcMint,
    collectionNonce: 0,
    collectionBump: gameBump,
    priceType: PriceType.Transfer,
    price: 100,
    usdcPrice: 0,
  }).sendAndConfirm(umi);

  const collection = await fetchCollection(umi, game);
  t.like(
    collection.dataSections,
    expectedData(umi, PriceType.Transfer, 100, 0)
  );
});

test('it rejects a USDC mint that is not USDC', async (t) => {
  const umi = await createUmi();
  const { game, gameBump } = await release(umi);

  const promise = updateGamePriceV1(umi, {
    game,
    usdcMint: PAYMENT_TOKEN_MINT,
    collectionNonce: 0,
    collectionBump: gameBump,
    priceType: PriceType.Transfer,
    price: 100,
    usdcPrice: 1,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { name: 'InvalidUsdcMint' });
  t.is(LOCALNET_USDC_MINT.length > 0, true);
});
