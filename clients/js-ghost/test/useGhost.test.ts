import { generateSigner } from '@metaplex-foundation/umi';
import test from 'ava';
import { createCollection } from '@metaplex-foundation/mpl-core';
import { createGhostV1, findGhostPda, useGhostV1 } from '../src';
import { createUmi } from './_setup';

test('it can use a ghost as the owner', async (t) => {
  // Given a Umi instance with an existing ghost.
  const umi = await createUmi();
  const ghostCollection = generateSigner(umi);
  const owner = generateSigner(umi);
  const player = generateSigner(umi);
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

  // When the player uses the ghost.
  await useGhostV1(umi, {
    ghost,
    ghostOwner: owner.publicKey,
    player,
  }).sendAndConfirm(umi);

  // Then no error was thrown.
  t.pass();
});

test('it can use a ghost as a different player', async (t) => {
  // Given a Umi instance with an existing ghost.
  const umi = await createUmi();
  const ghostCollection = generateSigner(umi);
  const owner = generateSigner(umi);
  const player = generateSigner(umi);
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

  // When a different player uses the ghost.
  await useGhostV1(umi, {
    ghost,
    ghostOwner: owner.publicKey,
    player,
  }).sendAndConfirm(umi);

  // Then no error was thrown.
  t.pass();
});

test('it cannot use a ghost without player signature', async (t) => {
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

  // When we try to use a ghost without a valid player signer.
  // Create a non-signer account by using publicKey directly
  const nonSignerPlayer = generateSigner(umi);

  // Then we expect an error because player must be a signer.
  await t.throwsAsync(
    useGhostV1(umi, {
      ghost,
      ghostOwner: owner.publicKey,
      player: nonSignerPlayer,
    }).sendAndConfirm(umi)
  );
});
