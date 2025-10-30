import { generateSigner } from '@metaplex-foundation/umi';
import test from 'ava';
import { createCollection, fetchAsset } from '@metaplex-foundation/mpl-core';
import { createGhostV1, expireGhostV1, findGhostPda } from '../src';
import { createUmi } from './_setup';

test('it can expire a ghost as authority', async (t) => {
  // Given a Umi instance with an existing ghost.
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

  // Create a ghost
  await createGhostV1(umi, {
    name: ghostName,
    uri: 'https://test-ghost.com',
    ghost,
    ghostCollection: ghostCollection.publicKey,
    owner: owner.publicKey,
  }).sendAndConfirm(umi);

  // Verify ghost exists
  const ghostAccount = await fetchAsset(umi, ghost[0]);
  t.truthy(ghostAccount);

  // When we expire the ghost as authority.
  await expireGhostV1(umi, {
    ghost,
    ghostCollection: ghostCollection.publicKey,
  }).sendAndConfirm(umi);

  // Then the ghost no longer exists.
  await t.throwsAsync(fetchAsset(umi, ghost[0]));
});

test('it can expire a ghost with explicit authority', async (t) => {
  // Given a Umi instance with an existing ghost.
  const umi = await createUmi();
  const ghostCollection = generateSigner(umi);
  const owner = generateSigner(umi);
  const authority = generateSigner(umi);
  const ghostName = `ghost-${Math.random().toString(36).substring(2, 15)}`;

  // Create the ghost collection
  await createCollection(umi, {
    collection: ghostCollection,
    name: 'Ghost Collection',
    uri: 'https://ghost-collection.com',
  }).sendAndConfirm(umi);

  // Derive ghost PDA
  const ghost = findGhostPda(umi, { name: ghostName });

  // Create a ghost
  await createGhostV1(umi, {
    name: ghostName,
    uri: 'https://test-ghost.com',
    ghost,
    ghostCollection: ghostCollection.publicKey,
    owner: owner.publicKey,
  }).sendAndConfirm(umi);

  // Verify ghost exists
  const ghostAccount = await fetchAsset(umi, ghost[0]);
  t.truthy(ghostAccount);

  // When we expire the ghost with explicit authority.
  await expireGhostV1(umi, {
    ghost,
    ghostCollection: ghostCollection.publicKey,
    authority,
  }).sendAndConfirm(umi);

  // Then the ghost no longer exists.
  await t.throwsAsync(fetchAsset(umi, ghost[0]));
});

test('it cannot expire a ghost without authority signature', async (t) => {
  // Given a Umi instance with an existing ghost.
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

  // Create a ghost
  await createGhostV1(umi, {
    name: ghostName,
    uri: 'https://test-ghost.com',
    ghost,
    ghostCollection: ghostCollection.publicKey,
    owner: owner.publicKey,
  }).sendAndConfirm(umi);

  // When we try to expire the ghost without proper authority.
  // Create a non-authority signer
  const unauthorizedAuthority = generateSigner(umi);

  // Then we expect an error.
  await t.throwsAsync(
    expireGhostV1(umi, {
      ghost,
      ghostCollection: ghostCollection.publicKey,
      authority: unauthorizedAuthority,
    }).sendAndConfirm(umi)
  );
});
