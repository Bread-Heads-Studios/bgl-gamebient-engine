import { publicKey } from '@metaplex-foundation/umi';
import test from 'ava';
import {
  CollectionV1,
  fetchCollection,
  LinkedAppDataPlugin,
  Key as MplCoreKey,
} from '@metaplex-foundation/mpl-core';
import { findGamePda, releaseGameV1 } from '../src';
import { createUmi } from './_setup';

test('it can release a new game', async (t) => {
  // Given a Umi instance and a new signer.
  const umi = await createUmi();
  // Set the name to a random string
  const name = Math.random().toString(36).substring(2, 15);
  const game = findGamePda(umi, {
    name,
    nonce: 0,
  });

  // When we create a new game.
  await releaseGameV1(umi, {
    name,
    uri: 'https://test-game.com',
  }).sendAndConfirm(umi);

  // Then an account was created with the correct data.
  const collectionData = await fetchCollection(umi, publicKey(game));
  t.like(collectionData, <CollectionV1>{
    key: MplCoreKey.CollectionV1,
    name,
    uri: 'https://test-game.com',
    updateAuthority: publicKey(game),
    numMinted: 0,
    currentSize: 0,
  });
  t.like(collectionData.linkedAppDatas, <LinkedAppDataPlugin[]>[
    {
      authority: { type: 'UpdateAuthority' },
      dataAuthority: { type: 'UpdateAuthority' },
      data: undefined,
      schema: 0,
    },
  ]);
});
