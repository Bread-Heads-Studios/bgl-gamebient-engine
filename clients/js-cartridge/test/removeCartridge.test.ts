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
  removeCartridgeV1,
} from '../src';
import { createUmi } from './_setup';

test('it can remove a cartridge from a machine', async (t) => {
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

  // Insert the cartridge into the machine
  await insertCartridgeV1(umi, {
    cartridge: cartridge.publicKey,
    game: publicKey(game),
    cartridgeOwner: umi.identity,
    machine: publicKey(machine),
    machineCollection: machineCollection.publicKey,
    machineOwner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump,
  }).sendAndConfirm(umi);

  // Verify cartridge is frozen and machine has cartridge data
  const cartridgeDataBefore = await fetchAsset(umi, cartridge.publicKey);
  t.like(cartridgeDataBefore, <AssetV1>{
    key: MplCoreKey.AssetV1,
    freezeDelegate: { frozen: true },
  });
  t.like(cartridgeDataBefore.linkedAppDatas, <LinkedAppDataPlugin[]>[
    {
      authority: { type: 'UpdateAuthority' },
      dataAuthority: { type: 'UpdateAuthority' },
      data: base58.serialize(cartridge.publicKey),
    },
  ]);

  const machineDataBefore = await fetchAsset(umi, publicKey(machine));
  t.like(machineDataBefore.appDatas, <AppDataPlugin[]>[
    {
      authority: { type: 'UpdateAuthority' },
      dataAuthority: { type: 'Address', address: publicKey(machine) },
      data: base58.serialize(cartridge.publicKey),
    },
  ]);

  // When we remove the cartridge from the machine
  await removeCartridgeV1(umi, {
    cartridge: cartridge.publicKey,
    game: publicKey(game),
    cartridgeOwner: umi.identity, // Must be signer
    machine: publicKey(machine),
    machineCollection: machineCollection.publicKey,
    machineOwner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump,
  }).sendAndConfirm(umi);

  // Then the cartridge should be unfrozen
  const cartridgeDataAfter = await fetchAsset(umi, cartridge.publicKey);
  t.like(cartridgeDataAfter, <AssetV1>{
    key: MplCoreKey.AssetV1,
    name: `${gameName} 1`,
    uri: 'https://test-game.com',
    owner: umi.identity.publicKey,
    updateAuthority: { type: 'Collection', address: publicKey(game) },
    freezeDelegate: undefined, // Should be unfrozen
  });

  // And the cartridge's linkedAppData should be empty
  t.like(cartridgeDataAfter.linkedAppDatas, <LinkedAppDataPlugin[]>[
    {
      authority: { type: 'UpdateAuthority' },
      dataAuthority: { type: 'UpdateAuthority' },
      data: Uint8Array.from([]),
    },
  ]);

  // And the machine's appData should be empty
  const machineDataAfter = await fetchAsset(umi, publicKey(machine));
  t.like(machineDataAfter.appDatas, <AppDataPlugin[]>[
    {
      authority: { type: 'UpdateAuthority' },
      dataAuthority: { type: 'Address', address: publicKey(machine) },
      data: Uint8Array.from([]),
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

  // Setup machine, game, and cartridge
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

  // Insert cartridge into machine
  await insertCartridgeV1(umi, {
    cartridge: cartridge.publicKey,
    game,
    cartridgeOwner: umi.identity,
    machine: publicKey(machine),
    machineCollection: machineCollection.publicKey,
    machineOwner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump,
  }).sendAndConfirm(umi);

  // When we try to remove cartridge with wrong owner signature
  const promise = removeCartridgeV1(umi, {
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

test('it fails when no cartridge is inserted', async (t) => {
  // Given a Umi instance and new signers.
  const umi = await createUmi();
  const machineCollection = generateSigner(umi);
  const cartridge = generateSigner(umi);
  const gameName = Math.random().toString(36).substring(2, 15);

  // Derive machine PDA
  const machine = findMachinePda(umi, {
    machineCollection: machineCollection.publicKey,
    name: 'Test Machine',
  });

  // Setup machine, game, and cartridge (but don't insert cartridge)
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

  // When we try to remove a cartridge that was never inserted
  const promise = removeCartridgeV1(umi, {
    cartridge: cartridge.publicKey,
    game,
    cartridgeOwner: umi.identity,
    machine: publicKey(machine),
    machineCollection: machineCollection.publicKey,
    machineOwner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump,
  }).sendAndConfirm(umi);

  // Then it should fail
  await t.throwsAsync(promise, { name: 'CartridgeNotInserted' });
});
