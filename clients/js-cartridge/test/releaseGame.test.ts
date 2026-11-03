import { publicKey, some } from '@metaplex-foundation/umi';
import test from 'ava';
import {
  CollectionV1,
  DataSectionPlugin,
  fetchCollection,
  LinkedAppDataPlugin,
  Key as MplCoreKey,
} from '@metaplex-foundation/mpl-core';
import {
  fetchToken,
  findAssociatedTokenPda,
  TokenAccountData,
} from '@metaplex-foundation/mpl-toolbox';
import {
  findGamePda,
  CRUMBS_MINT,
  PAYMENT_TOKEN_MINT,
  PriceType,
  readGameCollectionData,
  releaseGameV1,
  USDC_MINT,
} from '../src';
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
    priceType: PriceType.Transfer,
    price: 100,
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
  t.like(collectionData.dataSections, <DataSectionPlugin[]>[
    {
      type: 'DataSection',
      parentKey: {
        type: 'LinkedAppData',
        dataAuthority: { type: 'UpdateAuthority' },
      },
    },
  ]);
  t.like(readGameCollectionData(collectionData.dataSections![0].data!), {
    version: 1,
    priceType: PriceType.Transfer,
    price: 100n,
    publisher: umi.identity.publicKey,
    paymentMint: CRUMBS_MINT,
  });

  // And the permanent delegates should be set for AML compliance
  t.like(collectionData.permanentTransferDelegate, {
    authority: { type: 'UpdateAuthority' },
  });
  t.like(collectionData.permanentBurnDelegate, {
    authority: { type: 'UpdateAuthority' },
  });

  // And the game token account should be created
  const gameTokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: PAYMENT_TOKEN_MINT,
      owner: publicKey(game),
    })
  );
  t.like(gameTokenAccount, <Partial<TokenAccountData>>{
    mint: PAYMENT_TOKEN_MINT,
    owner: publicKey(game),
    amount: 0n,
  });
});

test('it can release a USDC-priced game with no game token account', async (t) => {
  const umi = await createUmi();
  const name = Math.random().toString(36).substring(2, 15);
  const [game] = findGamePda(umi, { name, nonce: 0 });

  await releaseGameV1(umi, {
    name,
    uri: 'https://test-game.com',
    priceType: PriceType.Transfer,
    price: 2_990_000,
    paymentMintChoice: some(USDC_MINT),
    paymentMint: USDC_MINT,
  }).sendAndConfirm(umi);

  const collection = await fetchCollection(umi, publicKey(game));
  t.like(readGameCollectionData(collection.dataSections![0].data!), {
    version: 1,
    price: 2_990_000n,
    paymentMint: USDC_MINT,
  });
  const [crumbsAta] = findAssociatedTokenPda(umi, {
    mint: CRUMBS_MINT,
    owner: publicKey(game),
  });
  t.false(await umi.rpc.accountExists(crumbsAta));
});

test('it rejects releasing with USDC and Burn', async (t) => {
  const umi = await createUmi();
  const name = Math.random().toString(36).substring(2, 15);
  const promise = releaseGameV1(umi, {
    name,
    uri: 'https://test-game.com',
    priceType: PriceType.Burn,
    price: 2_990_000,
    paymentMintChoice: some(USDC_MINT),
    paymentMint: USDC_MINT,
  }).sendAndConfirm(umi);
  await t.throwsAsync(promise, { name: 'BurnNotAllowedForMint' });
});

test('it rejects a payment mint account that does not match the arg', async (t) => {
  const umi = await createUmi();
  const name = Math.random().toString(36).substring(2, 15);
  const promise = releaseGameV1(umi, {
    name,
    uri: 'https://test-game.com',
    priceType: PriceType.Transfer,
    price: 2_990_000,
    paymentMintChoice: some(USDC_MINT),
    // paymentMint account left at its CRUMBS default
  }).sendAndConfirm(umi);
  await t.throwsAsync(promise, { name: 'InvalidPaymentMint' });
});
