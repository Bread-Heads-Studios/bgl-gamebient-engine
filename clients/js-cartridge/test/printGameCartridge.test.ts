import { generateSigner, publicKey } from '@metaplex-foundation/umi';
import test from 'ava';
import {
  AppDataPlugin,
  AssetV1,
  CollectionV1,
  fetchAsset,
  fetchCollection,
  Key as MplCoreKey,
} from '@metaplex-foundation/mpl-core';
import {
  findGamePda,
  getCartridgeDataSerializer,
  PriceType,
  printGameCartridgeV1,
  releaseGameV1,
  Source,
} from '../src';
import { createUmi } from './_setup';

test('it can print a new game cartridge with the default Unknown source', async (t) => {
  // Given a Umi instance and a new signer.
  const umi = await createUmi();
  const cartridge = generateSigner(umi);
  const gameName = Math.random().toString(36).substring(2, 15);
  const [game, gameBump] = findGamePda(umi, {
    name: gameName,
    nonce: 0,
  });

  // When we create a new game.
  await releaseGameV1(umi, {
    name: gameName,
    uri: 'https://test-game.com',
    priceType: PriceType.Burn,
    price: 0,
  }).sendAndConfirm(umi);

  // Then an account was created with the correct data.
  t.like(await fetchCollection(umi, publicKey(game)), <CollectionV1>{
    key: MplCoreKey.CollectionV1,
    name: gameName,
    uri: 'https://test-game.com',
    updateAuthority: publicKey(game),
    numMinted: 0,
    currentSize: 0,
  });

  // When we print a new game cartridge.
  await printGameCartridgeV1(umi, {
    game: publicKey(game),
    cartridge,
    owner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump: gameBump,
  }).sendAndConfirm(umi);

  // Then an account was created with the correct data.
  const asset = await fetchAsset(umi, cartridge.publicKey);
  t.like(asset, <AssetV1>{
    key: MplCoreKey.AssetV1,
    name: `${gameName} 1`,
    uri: 'https://test-game.com',
    owner: umi.identity.publicKey,
    updateAuthority: { type: 'Collection', address: publicKey(game) },
  });

  // And the permanent freeze delegate should be set per-asset for AML compliance
  t.like(asset.permanentFreezeDelegate, {
    authority: { type: 'UpdateAuthority' },
    frozen: true,
  });

  // And the source AppData plugin should default to Unknown — only the AML
  // authority can later upgrade it via setCartridgeSourceV1.
  const expectedData = getCartridgeDataSerializer().serialize({
    version: 0,
    source: Source.Unknown,
  });
  t.like(asset.appDatas, <AppDataPlugin[]>[
    {
      type: 'AppData',
      authority: { type: 'UpdateAuthority' },
      dataAuthority: { type: 'UpdateAuthority' },
      data: expectedData,
    },
  ]);
});
