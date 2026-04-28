/* eslint-disable import/no-extraneous-dependencies */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  createSignerFromKeypair,
  generateSigner,
  publicKey,
  Signer,
  Umi,
} from '@metaplex-foundation/umi';
import test from 'ava';
import { AppDataPlugin, fetchAsset } from '@metaplex-foundation/mpl-core';
import {
  findGamePda,
  getCartridgeDataSerializer,
  PriceType,
  printGameCartridgeV1,
  releaseGameV1,
  setCartridgeSourceV1,
  Source,
} from '../src';
import { createUmi } from './_setup';

const loadSourceAuthority = (umi: Umi): Signer => {
  // ava compiles tests to dist/test/, so __dirname is dist/test/. The fixture
  // file lives in source under test/fixtures/, two levels up.
  const path = join(
    __dirname,
    '..',
    '..',
    'test',
    'fixtures',
    'source-authority.json'
  );
  const secret = new Uint8Array(JSON.parse(readFileSync(path, 'utf-8')));
  const keypair = umi.eddsa.createKeypairFromSecretKey(secret);
  return createSignerFromKeypair(umi, keypair);
};

const releaseAndPrint = async (
  umi: Umi
): Promise<{
  cartridge: ReturnType<typeof generateSigner>;
  game: ReturnType<typeof publicKey>;
  gameBump: number;
}> => {
  const cartridge = generateSigner(umi);
  const gameName = Math.random().toString(36).substring(2, 15);
  const [game, gameBump] = findGamePda(umi, { name: gameName, nonce: 0 });

  await releaseGameV1(umi, {
    name: gameName,
    uri: 'https://test-game.com',
    priceType: PriceType.Burn,
    price: 0,
  }).sendAndConfirm(umi);

  await printGameCartridgeV1(umi, {
    game: publicKey(game),
    cartridge,
    owner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump: gameBump,
  }).sendAndConfirm(umi);

  return { cartridge, game: publicKey(game), gameBump };
};

const expectedAppData = (source: Source): AppDataPlugin[] => {
  const data = getCartridgeDataSerializer().serialize({
    version: 0,
    source,
  });
  return <AppDataPlugin[]>[
    {
      type: 'AppData',
      authority: { type: 'UpdateAuthority' },
      dataAuthority: { type: 'UpdateAuthority' },
      data,
    },
  ];
};

test('the Source authority can set the source to Crypto', async (t) => {
  const umi = await createUmi();
  const src = loadSourceAuthority(umi);
  const { cartridge, game, gameBump } = await releaseAndPrint(umi);

  await setCartridgeSourceV1(umi, {
    cartridge: cartridge.publicKey,
    game,
    authority: src,
    collectionNonce: 0,
    collectionBump: gameBump,
    source: Source.Crypto,
  }).sendAndConfirm(umi);

  const asset = await fetchAsset(umi, cartridge.publicKey);
  t.like(asset.appDatas, expectedAppData(Source.Crypto));
});

test('the Source authority can set the source to Stripe', async (t) => {
  const umi = await createUmi();
  const src = loadSourceAuthority(umi);
  const { cartridge, game, gameBump } = await releaseAndPrint(umi);

  await setCartridgeSourceV1(umi, {
    cartridge: cartridge.publicKey,
    game,
    authority: src,
    collectionNonce: 0,
    collectionBump: gameBump,
    source: Source.Stripe,
  }).sendAndConfirm(umi);

  const asset = await fetchAsset(umi, cartridge.publicKey);
  t.like(asset.appDatas, expectedAppData(Source.Stripe));
});

test('it rejects setting the source to Unknown', async (t) => {
  const umi = await createUmi();
  const src = loadSourceAuthority(umi);
  const { cartridge, game, gameBump } = await releaseAndPrint(umi);

  const promise = setCartridgeSourceV1(umi, {
    cartridge: cartridge.publicKey,
    game,
    authority: src,
    collectionNonce: 0,
    collectionBump: gameBump,
    source: Source.Unknown,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { name: 'InvalidSource' });
});

test('it rejects a non-Source authority signer', async (t) => {
  const umi = await createUmi();
  const imposter = generateSigner(umi);
  const { cartridge, game, gameBump } = await releaseAndPrint(umi);

  const promise = setCartridgeSourceV1(umi, {
    cartridge: cartridge.publicKey,
    game,
    authority: imposter,
    collectionNonce: 0,
    collectionBump: gameBump,
    source: Source.Crypto,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { name: 'InvalidSourceAuthority' });
});

test('it rejects a second set after the source has been recorded by the Source authority', async (t) => {
  const umi = await createUmi();
  const src = loadSourceAuthority(umi);
  const { cartridge, game, gameBump } = await releaseAndPrint(umi);

  await setCartridgeSourceV1(umi, {
    cartridge: cartridge.publicKey,
    game,
    authority: src,
    collectionNonce: 0,
    collectionBump: gameBump,
    source: Source.Crypto,
  }).sendAndConfirm(umi);

  const promise = setCartridgeSourceV1(umi, {
    cartridge: cartridge.publicKey,
    game,
    authority: src,
    collectionNonce: 0,
    collectionBump: gameBump,
    source: Source.Stripe,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { name: 'SourceAlreadySet' });
});
