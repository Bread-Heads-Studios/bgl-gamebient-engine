/* eslint-disable import/no-extraneous-dependencies */
import {
  generateSigner,
  publicKey,
  PublicKey,
  Signer,
  Umi,
} from '@metaplex-foundation/umi';
import test from 'ava';
import {
  fetchAsset,
  fetchCollection,
  fetchGroupV1,
  Key as MplCoreKey,
} from '@metaplex-foundation/mpl-core';
import {
  createLibraryV1,
  findGamePda,
  findLibraryPda,
  listGameV1,
  optInLibraryV1,
  PriceType,
  printGameCartridgeV1,
  releaseGameV1,
} from '../src';
import { createUmi } from './_setup';

const releaseGame = async (
  umi: Umi
): Promise<{ game: PublicKey; gameName: string; gameBump: number }> => {
  const gameName = Math.random().toString(36).substring(2, 15);
  const [game, gameBump] = findGamePda(umi, { name: gameName, nonce: 0 });

  await releaseGameV1(umi, {
    name: gameName,
    uri: 'https://test-game.com',
    priceType: PriceType.Burn,
    price: 0,
  }).sendAndConfirm(umi);

  return { game: publicKey(game), gameName, gameBump };
};

const createLibrary = async (umi: Umi): Promise<Signer> => {
  const group = generateSigner(umi);
  await createLibraryV1(umi, {
    group,
    name: 'GX Library',
    uri: 'https://test-library.com',
  }).sendAndConfirm(umi);
  return group;
};

test('it can create a library owned by the curator library PDA', async (t) => {
  const umi = await createUmi();
  const group = await createLibrary(umi);

  const [library] = findLibraryPda(umi, { curator: umi.identity.publicKey });
  const groupAccount = await fetchGroupV1(umi, group.publicKey);
  t.is(groupAccount.key, MplCoreKey.GroupV1);
  t.is(groupAccount.updateAuthority, publicKey(library));
  t.is(groupAccount.name, 'GX Library');
  t.is(groupAccount.uri, 'https://test-library.com');
  t.deepEqual(groupAccount.collections, []);
});

test('a publisher can opt a game into a library', async (t) => {
  const umi = await createUmi();
  const { game, gameBump } = await releaseGame(umi);
  const [library] = findLibraryPda(umi, { curator: umi.identity.publicKey });

  await optInLibraryV1(umi, {
    game,
    curator: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump: gameBump,
  }).sendAndConfirm(umi);

  const collection = await fetchCollection(umi, game);
  t.like(collection.updateDelegate, {
    authority: { type: 'UpdateAuthority' },
    additionalDelegates: [publicKey(library)],
  });
});

test('a game cannot opt in twice', async (t) => {
  const umi = await createUmi();
  const { game, gameBump } = await releaseGame(umi);

  await optInLibraryV1(umi, {
    game,
    curator: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump: gameBump,
  }).sendAndConfirm(umi);

  await t.throwsAsync(
    optInLibraryV1(umi, {
      game,
      curator: umi.identity.publicKey,
      collectionNonce: 0,
      collectionBump: gameBump,
    }).sendAndConfirm(umi),
    { name: 'LibraryDelegateAlreadySet' }
  );
});

test('only the publisher can opt a game in', async (t) => {
  const umi = await createUmi();
  const { game, gameBump } = await releaseGame(umi);
  const stranger = generateSigner(umi);

  await t.throwsAsync(
    optInLibraryV1(umi, {
      game,
      curator: umi.identity.publicKey,
      publisher: stranger,
      collectionNonce: 0,
      collectionBump: gameBump,
    }).sendAndConfirm(umi),
    { name: 'InvalidPublisher' }
  );
});

test('a curator can list an opted-in game', async (t) => {
  const umi = await createUmi();
  const group = await createLibrary(umi);
  const { game, gameBump } = await releaseGame(umi);

  await optInLibraryV1(umi, {
    game,
    curator: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump: gameBump,
  }).sendAndConfirm(umi);

  await listGameV1(umi, {
    group: group.publicKey,
    game,
  }).sendAndConfirm(umi);

  const groupAccount = await fetchGroupV1(umi, group.publicKey);
  t.deepEqual(groupAccount.collections, [game]);

  const collection = await fetchCollection(umi, game);
  t.deepEqual(collection.groups?.groups, [group.publicKey]);
});

test('a game cannot be listed without opting in', async (t) => {
  const umi = await createUmi();
  const group = await createLibrary(umi);
  const { game } = await releaseGame(umi);

  // Core rejects the library PDA as a collection authority.
  await t.throwsAsync(
    listGameV1(umi, {
      group: group.publicKey,
      game,
    }).sendAndConfirm(umi)
  );

  const groupAccount = await fetchGroupV1(umi, group.publicKey);
  t.deepEqual(groupAccount.collections, []);
});

test('only the curator who owns the group can list into it', async (t) => {
  const umi = await createUmi();
  const group = await createLibrary(umi);
  const { game, gameBump } = await releaseGame(umi);
  const otherCurator = generateSigner(umi);

  await optInLibraryV1(umi, {
    game,
    curator: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump: gameBump,
  }).sendAndConfirm(umi);

  // The other curator's library PDA is not the group's update authority.
  await t.throwsAsync(
    listGameV1(umi, {
      group: group.publicKey,
      game,
      curator: otherCurator,
    }).sendAndConfirm(umi)
  );
});

test('a listed game still prints cartridges', async (t) => {
  const umi = await createUmi();
  const group = await createLibrary(umi);
  const { game, gameBump } = await releaseGame(umi);

  await optInLibraryV1(umi, {
    game,
    curator: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump: gameBump,
  }).sendAndConfirm(umi);
  await listGameV1(umi, {
    group: group.publicKey,
    game,
  }).sendAndConfirm(umi);

  const cartridge = generateSigner(umi);
  await printGameCartridgeV1(umi, {
    game,
    cartridge,
    owner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump: gameBump,
  }).sendAndConfirm(umi);

  const asset = await fetchAsset(umi, cartridge.publicKey);
  t.is(asset.owner, umi.identity.publicKey);
  t.deepEqual(asset.updateAuthority, { type: 'Collection', address: game });
});
