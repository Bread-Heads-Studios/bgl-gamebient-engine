import { generateSigner, publicKey } from '@metaplex-foundation/umi';
import test from 'ava';
import {
  AssetV1,
  createCollection,
  ExternalPluginAdapterSchema,
  fetchAsset,
  Key as MplCoreKey,
} from '@metaplex-foundation/mpl-core';
import { createGhostV1, findGhostPda } from '../src';
import { createUmi } from './_setup';

test('it can create a new ghost', async (t) => {
  // Given a Umi instance and a ghost collection.
  const umi = await createUmi();
  const ghostCollection = generateSigner(umi);
  const owner = generateSigner(umi);
  const ghostName = `ghost-${Math.random().toString(36).substring(2, 15)}`;

  // Create the ghost collection
  await createCollection(umi, {
    collection: ghostCollection,
    name: 'Ghost Collection',
    uri: 'https://ghost-collection.com',
  }).sendAndConfirm(umi);

  // Derive ghost PDA
  const ghost = findGhostPda(umi, { name: ghostName });

  // When we create a new ghost.
  await createGhostV1(umi, {
    name: ghostName,
    uri: 'https://test-ghost.com',
    ghost,
    ghostCollection: ghostCollection.publicKey,
    owner: owner.publicKey,
  }).sendAndConfirm(umi);

  // Then an account was created with the correct data.
  t.like(await fetchAsset(umi, ghost[0]), <AssetV1>{
    key: MplCoreKey.AssetV1,
    name: ghostName,
    uri: 'https://test-ghost.com',
    owner: owner.publicKey,
    updateAuthority: {
      type: 'Collection',
      address: ghostCollection.publicKey,
    },
    appDatas: [
      {
        authority: { type: 'UpdateAuthority', address: undefined },
        dataAuthority: { type: 'Address', address: publicKey(ghost) },
        lifecycleChecks: undefined,
        schema: ExternalPluginAdapterSchema.Binary,
        type: 'AppData',
      },
    ],
  });
});

test('it cannot create a ghost with duplicate name', async (t) => {
  // Given a Umi instance and an existing ghost.
  const umi = await createUmi();
  const ghostCollection = generateSigner(umi);
  const owner = generateSigner(umi);
  const ghostName = `ghost-${Math.random().toString(36).substring(2, 15)}`;

  // Create the ghost collection
  await createCollection(umi, {
    collection: ghostCollection,
    name: 'Ghost Collection',
    uri: 'https://ghost-collection.com',
  }).sendAndConfirm(umi);

  // Derive ghost PDA
  const ghost = findGhostPda(umi, { name: ghostName });

  // Create the first ghost
  await createGhostV1(umi, {
    name: ghostName,
    uri: 'https://test-ghost.com',
    ghost,
    ghostCollection: ghostCollection.publicKey,
    owner: owner.publicKey,
  }).sendAndConfirm(umi);

  // When we try to create another ghost with the same name.
  // Then we expect an error.
  await t.throwsAsync(
    createGhostV1(umi, {
      name: ghostName,
      uri: 'https://test-ghost-2.com',
      ghost,
      ghostCollection: ghostCollection.publicKey,
      owner: owner.publicKey,
    }).sendAndConfirm(umi)
  );
});

test('it cannot create a ghost with unauthorized authority', async (t) => {
  // Given a Umi instance and an unauthorized signer.
  const umi = await createUmi();
  const ghostCollection = generateSigner(umi);
  const owner = generateSigner(umi);
  const unauthorizedAuthority = generateSigner(umi);
  const ghostName = `ghost-${Math.random().toString(36).substring(2, 15)}`;

  // Create the ghost collection
  await createCollection(umi, {
    collection: ghostCollection,
    name: 'Ghost Collection',
    uri: 'https://ghost-collection.com',
  }).sendAndConfirm(umi);

  // Derive ghost PDA
  const ghost = findGhostPda(umi, { name: ghostName });

  // When we try to create a ghost with an unauthorized authority.
  // Then we expect an error.
  await t.throwsAsync(
    createGhostV1(umi, {
      name: ghostName,
      uri: 'https://test-ghost.com',
      ghost,
      ghostCollection: ghostCollection.publicKey,
      owner: owner.publicKey,
      authority: unauthorizedAuthority,
    }).sendAndConfirm(umi)
  );
});
