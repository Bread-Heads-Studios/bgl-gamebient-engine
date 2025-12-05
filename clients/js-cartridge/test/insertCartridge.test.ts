import { generateSigner, publicKey } from '@metaplex-foundation/umi';
import test from 'ava';
import {
  AppDataPlugin,
  AssetV1,
  createCollection,
  fetchAsset,
  LinkedAppDataPlugin,
  Key as MplCoreKey,
} from '@metaplex-foundation/mpl-core';
import { base58 } from '@metaplex-foundation/umi/serializers';
import {
  commissionMachineV1,
  findGamePda,
  findMachinePda,
  insertCartridgeV1,
  printGameCartridgeV1,
  releaseGameV1,
} from '../src';
import { createUmi } from './_setup';

test('it can insert a cartridge into a machine', async (t) => {
  // Given a Umi instance and new signers.
  const umi = await createUmi();
  const machineCollection = generateSigner(umi);
  const cartridge = generateSigner(umi);
  const gameName = Math.random().toString(36).substring(2, 15);
  const game = findGamePda(umi, {
    name: gameName,
    nonce: 0,
  });

  // Derive machine PDA
  const machine = findMachinePda(umi, {
    machineCollection: machineCollection.publicKey,
    name: 'Test Machine',
  });

  // Create machine collection
  await createCollection(umi, {
    collection: machineCollection,
    name: 'Machine Collection',
    uri: 'https://machine-collection.com',
  }).sendAndConfirm(umi);

  // Create a new machine
  await commissionMachineV1(umi, {
    name: 'Test Machine',
    uri: 'https://test-machine.com',
    machineCollection: machineCollection.publicKey,
    owner: umi.identity.publicKey,
  }).sendAndConfirm(umi);

  // Create a new game
  await releaseGameV1(umi, {
    name: gameName,
    uri: 'https://test-game.com',
    price: 100,
  }).sendAndConfirm(umi);

  const [, collectionBump] = findGamePda(umi, {
    name: gameName,
    nonce: 0,
  });

  // Print a new game cartridge
  await printGameCartridgeV1(umi, {
    game: publicKey(game),
    cartridge,
    owner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump,
  }).sendAndConfirm(umi);

  // Verify cartridge was created unfrozen initially
  t.like(await fetchAsset(umi, cartridge.publicKey), <AssetV1>{
    key: MplCoreKey.AssetV1,
    name: `${gameName} 1`,
    uri: 'https://test-game.com',
    owner: umi.identity.publicKey,
    updateAuthority: { type: 'Collection', address: publicKey(game) },
    freezeDelegate: undefined,
  });

  // When we insert the cartridge into the machine
  await insertCartridgeV1(umi, {
    cartridge: cartridge.publicKey,
    game: publicKey(game),
    cartridgeOwner: umi.identity, // Must be signer
    machine: publicKey(machine),
    machineCollection: machineCollection.publicKey,
    machineOwner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump,
  }).sendAndConfirm(umi);

  // Then the cartridge should be frozen
  const cartridgeData = await fetchAsset(umi, cartridge.publicKey);
  t.like(cartridgeData, <AssetV1>{
    key: MplCoreKey.AssetV1,
    name: `${gameName} 1`,
    uri: 'https://test-game.com',
    owner: umi.identity.publicKey,
    updateAuthority: { type: 'Collection', address: publicKey(game) },
    freezeDelegate: { frozen: true },
  });
  t.like(cartridgeData.linkedAppDatas, <LinkedAppDataPlugin[]>[
    {
      authority: { type: 'UpdateAuthority' },
      dataAuthority: { type: 'UpdateAuthority' },
      data: base58.serialize(cartridge.publicKey),
    },
  ]);

  // And the machine should have the cartridge in its AppData
  const machineData = await fetchAsset(umi, publicKey(machine));
  t.like(machineData, <AssetV1>{
    key: MplCoreKey.AssetV1,
    name: 'Test Machine',
    uri: 'https://test-machine.com',
    owner: umi.identity.publicKey,
    updateAuthority: {
      type: 'Collection',
      address: machineCollection.publicKey,
    },
  });
  t.like(machineData.appDatas, <AppDataPlugin[]>[
    {
      authority: { type: 'UpdateAuthority' },
      dataAuthority: { type: 'Address', address: publicKey(machine) },
      data: base58.serialize(cartridge.publicKey),
    },
  ]);
});

test('it fails when cartridge owner does not sign', async (t) => {
  // Given a Umi instance and new signers.
  const umi = await createUmi();
  const machineCollection = generateSigner(umi);
  const cartridge = generateSigner(umi);
  const otherUser = generateSigner(umi);
  const gameName = Math.random().toString(36).substring(2, 15);

  // Derive machine PDA
  const machine = findMachinePda(umi, {
    machineCollection: machineCollection.publicKey,
    name: 'Test Machine',
  });

  // Setup machine, game, and cartridge (similar to above test)
  await createCollection(umi, {
    collection: machineCollection,
    name: 'Machine Collection',
    uri: 'https://machine-collection.com',
  }).sendAndConfirm(umi);

  await commissionMachineV1(umi, {
    name: 'Test Machine',
    uri: 'https://test-machine.com',
    machineCollection: machineCollection.publicKey,
    owner: umi.identity.publicKey,
  }).sendAndConfirm(umi);

  await releaseGameV1(umi, {
    name: gameName,
    uri: 'https://test-game.com',
    price: 100,
  }).sendAndConfirm(umi);

  const [game, collectionBump] = findGamePda(umi, {
    name: gameName,
    nonce: 0,
  });

  await printGameCartridgeV1(umi, {
    game,
    cartridge,
    owner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump,
  }).sendAndConfirm(umi);

  // When we try to insert cartridge with wrong owner signature
  const promise = insertCartridgeV1(umi, {
    cartridge: cartridge.publicKey,
    game,
    cartridgeOwner: otherUser, // Wrong signer - should be umi.identity
    machine: publicKey(machine),
    machineCollection: machineCollection.publicKey,
    machineOwner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump,
  }).sendAndConfirm(umi);

  // Then it should fail
  await t.throwsAsync(promise, {
    message: /Neither the asset or any plugins have approved this operation/,
  });
});

test('it fails when a cartridge is already inserted', async (t) => {
  // Given a Umi instance and new signers.
  const umi = await createUmi();
  const machineCollection = generateSigner(umi);
  const firstCartridge = generateSigner(umi);
  const secondCartridge = generateSigner(umi);
  const gameName = Math.random().toString(36).substring(2, 15);
  const game = findGamePda(umi, {
    name: gameName,
    nonce: 0,
  });

  // Derive machine PDA
  const machine = findMachinePda(umi, {
    machineCollection: machineCollection.publicKey,
    name: 'Test Machine',
  });

  // Create machine collection
  await createCollection(umi, {
    collection: machineCollection,
    name: 'Machine Collection',
    uri: 'https://machine-collection.com',
  }).sendAndConfirm(umi);

  // Create a new machine
  await commissionMachineV1(umi, {
    name: 'Test Machine',
    uri: 'https://test-machine.com',
    machineCollection: machineCollection.publicKey,
    owner: umi.identity.publicKey,
  }).sendAndConfirm(umi);

  // Create a new game
  await releaseGameV1(umi, {
    name: gameName,
    uri: 'https://test-game.com',
    price: 100,
  }).sendAndConfirm(umi);

  const [, collectionBump] = findGamePda(umi, {
    name: gameName,
    nonce: 0,
  });

  // Print two game cartridges
  await printGameCartridgeV1(umi, {
    game: publicKey(game),
    cartridge: firstCartridge,
    owner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump,
  }).sendAndConfirm(umi);

  await printGameCartridgeV1(umi, {
    game: publicKey(game),
    cartridge: secondCartridge,
    owner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump,
  }).sendAndConfirm(umi);

  // Insert the first cartridge into the machine
  await insertCartridgeV1(umi, {
    cartridge: firstCartridge.publicKey,
    game: publicKey(game),
    cartridgeOwner: umi.identity,
    machine: publicKey(machine),
    machineCollection: machineCollection.publicKey,
    machineOwner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump,
  }).sendAndConfirm(umi);

  // Verify first cartridge is inserted
  const machineData = await fetchAsset(umi, publicKey(machine));
  t.like(machineData.appDatas, <AppDataPlugin[]>[
    {
      authority: { type: 'UpdateAuthority' },
      dataAuthority: { type: 'Address', address: publicKey(machine) },
      data: base58.serialize(firstCartridge.publicKey),
    },
  ]);

  // When we try to insert a second cartridge into the same machine
  const promise = insertCartridgeV1(umi, {
    cartridge: secondCartridge.publicKey,
    game: publicKey(game),
    cartridgeOwner: umi.identity,
    machine: publicKey(machine),
    machineCollection: machineCollection.publicKey,
    machineOwner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump,
  }).sendAndConfirm(umi);

  // Then it should fail
  await t.throwsAsync(promise, { name: 'CartridgeAlreadyInserted' });
});
