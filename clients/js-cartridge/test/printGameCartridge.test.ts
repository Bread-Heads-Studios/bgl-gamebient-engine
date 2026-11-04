import {
  generateSigner,
  publicKey,
  some,
  sol,
  Umi,
} from '@metaplex-foundation/umi';
import {
  createIdempotentAssociatedToken,
  fetchToken,
  findAssociatedTokenPda,
} from '@metaplex-foundation/mpl-toolbox';
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
  CRUMBS_MINT,
  USDC_MINT,
  findGamePda,
  findPrintPaymentAccounts,
  readGameCollectionData,
  getCartridgeDataSerializer,
  PriceType,
  printGameCartridgeV1,
  releaseGameV1,
  Source,
} from '../src';
import { createUmi, fundUsdc } from './_setup';

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

const releaseUsdc = async (umi: Umi, price = 2_990_000) => {
  const name = Math.random().toString(36).substring(2, 15);
  const [game, gameBump] = findGamePda(umi, { name, nonce: 0 });
  await releaseGameV1(umi, {
    name,
    uri: 'https://test-game.com',
    priceType: PriceType.Transfer,
    price,
    paymentMintChoice: some(USDC_MINT),
    paymentMint: USDC_MINT,
  }).sendAndConfirm(umi);
  const collection = await fetchCollection(umi, publicKey(game));
  const data = readGameCollectionData(collection.dataSections![0].data!);
  return { game: publicKey(game), gameBump, data };
};

test('a USDC print pays the publisher', async (t) => {
  const umi = await createUmi();
  const buyer = generateSigner(umi);
  await umi.rpc.airdrop(buyer.publicKey, sol(1));
  await fundUsdc(umi, buyer.publicKey, 10_000_000n);
  const { game, gameBump, data } = await releaseUsdc(umi);
  // The publisher (umi.identity) needs a USDC token account to be paid into.
  const [pubAta] = findAssociatedTokenPda(umi, {
    mint: USDC_MINT,
    owner: data.publisher,
  });
  await createIdempotentAssociatedToken(umi, {
    mint: USDC_MINT,
    owner: data.publisher,
    ata: pubAta,
  }).sendAndConfirm(umi);

  const cartridge = generateSigner(umi);
  await printGameCartridgeV1(umi, {
    game,
    cartridge,
    owner: buyer.publicKey,
    payer: buyer,
    collectionNonce: 0,
    collectionBump: gameBump,
    ...findPrintPaymentAccounts(umi, { game, payer: buyer.publicKey, data }),
  }).sendAndConfirm(umi);

  const [publisherAta] = findAssociatedTokenPda(umi, {
    mint: USDC_MINT,
    owner: data.publisher,
  });
  const [buyerAta] = findAssociatedTokenPda(umi, {
    mint: USDC_MINT,
    owner: buyer.publicKey,
  });
  t.is((await fetchToken(umi, publisherAta)).amount, 2_990_000n);
  t.is((await fetchToken(umi, buyerAta)).amount, 7_010_000n);
  t.true(await umi.rpc.accountExists(cartridge.publicKey));
});

test('a USDC print rejects a token account the publisher does not own', async (t) => {
  const umi = await createUmi();
  const thief = generateSigner(umi).publicKey;
  await fundUsdc(umi, umi.identity.publicKey, 10_000_000n);
  await fundUsdc(umi, thief, 0n);
  const { game, gameBump, data } = await releaseUsdc(umi);

  const accounts = findPrintPaymentAccounts(umi, {
    game,
    payer: umi.identity.publicKey,
    data,
  });
  const [thiefAta] = findAssociatedTokenPda(umi, {
    mint: USDC_MINT,
    owner: thief,
  });
  const promise = printGameCartridgeV1(umi, {
    game,
    cartridge: generateSigner(umi),
    owner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump: gameBump,
    ...accounts,
    gameTokenAccount: thiefAta,
  }).sendAndConfirm(umi);
  await t.throwsAsync(promise, { name: 'InvalidGameTokenAccountOwner' });
});

test('a USDC print rejects CRUMBS accounts', async (t) => {
  const umi = await createUmi();
  const { game, gameBump } = await releaseUsdc(umi);
  // The generated defaults are the CRUMBS accounts.
  const promise = printGameCartridgeV1(umi, {
    game,
    cartridge: generateSigner(umi),
    owner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump: gameBump,
  }).sendAndConfirm(umi);
  await t.throwsAsync(promise);
});

test('a v0-style CRUMBS game still prints for free', async (t) => {
  const umi = await createUmi();
  const name = Math.random().toString(36).substring(2, 15);
  const [game, gameBump] = findGamePda(umi, { name, nonce: 0 });
  await releaseGameV1(umi, {
    name,
    uri: 'https://test-game.com',
    priceType: PriceType.Burn,
    price: 0,
  }).sendAndConfirm(umi);
  const collection = await fetchCollection(umi, publicKey(game));
  const data = readGameCollectionData(collection.dataSections![0].data!);
  t.deepEqual(
    findPrintPaymentAccounts(umi, {
      game: publicKey(game),
      payer: umi.identity.publicKey,
      data,
    }).paymentMint,
    CRUMBS_MINT
  );
  const cartridge = generateSigner(umi);
  await printGameCartridgeV1(umi, {
    game: publicKey(game),
    cartridge,
    owner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump: gameBump,
  }).sendAndConfirm(umi);
  t.true(await umi.rpc.accountExists(cartridge.publicKey));
});
