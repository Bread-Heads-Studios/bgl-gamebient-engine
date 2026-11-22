import {
  generateSigner,
  none,
  publicKey,
  some,
} from '@metaplex-foundation/umi';
import test from 'ava';
import { fetchCollection } from '@metaplex-foundation/mpl-core';
import {
  CRUMBS_MINT,
  USDC_MINT,
  PriceType,
  readLookData,
  updateLookV1,
} from '../src';
import {
  createUmi,
  LOOK_URI,
  registerTestLook,
  releaseFreeGame,
} from './_setup';

const noChange = {
  uri: none<string>(),
  contentHash: none<Uint8Array>(),
  priceType: none<PriceType>(),
  price: none<bigint>(),
  paymentMintChoice: none<ReturnType<typeof publicKey>>(),
};

const registered = async (
  umi: Awaited<ReturnType<typeof createUmi>>,
  options: Parameters<typeof registerTestLook>[2] = {}
) => {
  const game = await releaseFreeGame(umi);
  const look = await registerTestLook(umi, game, options);
  await look.builder.sendAndConfirm(umi);
  return look;
};

const readData = async (
  umi: Awaited<ReturnType<typeof createUmi>>,
  look: ReturnType<typeof publicKey>
) => {
  const collection = await fetchCollection(umi, look);
  return { collection, data: readLookData(collection.dataSections![0].data!) };
};

test('the creator updates uri, hash and price', async (t) => {
  const umi = await createUmi();
  const { look, creator, lookId } = await registered(umi);
  const hash = new Uint8Array(32).fill(9);
  await updateLookV1(umi, {
    look,
    creator,
    lookId,
    ...noChange,
    uri: some('https://look.example/fae-v2.json'),
    contentHash: some(hash),
    price: some(2_000_000n),
  }).sendAndConfirm(umi);

  const { collection, data } = await readData(umi, look);
  t.is(collection.uri, 'https://look.example/fae-v2.json');
  t.like(data, {
    lookVersion: 2,
    price: 2_000_000n,
    paymentMint: USDC_MINT,
    priceType: PriceType.Transfer,
    creator: creator.publicKey,
  });
  t.deepEqual(data.contentHash, hash);
});

test('a uri-only update bumps the version and changes the collection uri', async (t) => {
  const umi = await createUmi();
  const { look, creator, lookId } = await registered(umi);
  await updateLookV1(umi, {
    look,
    creator,
    lookId,
    ...noChange,
    uri: some('https://look.example/only-uri.json'),
  }).sendAndConfirm(umi);
  const { collection, data } = await readData(umi, look);
  t.not(collection.uri, LOOK_URI);
  t.is(collection.uri, 'https://look.example/only-uri.json');
  t.is(data.lookVersion, 1 + 1);
  t.is(data.price, 1_500_000n);
});

test('a data-only update leaves the uri alone', async (t) => {
  const umi = await createUmi();
  const { look, creator, lookId } = await registered(umi);
  await updateLookV1(umi, {
    look,
    creator,
    lookId,
    ...noChange,
    price: some(5n),
  }).sendAndConfirm(umi);
  const { collection, data } = await readData(umi, look);
  t.is(collection.uri, LOOK_URI);
  t.is(data.lookVersion, 2);
});

test('a different signer as creator gets NotLookCreator', async (t) => {
  const umi = await createUmi();
  const { look, lookId } = await registered(umi);
  const stranger = generateSigner(umi);
  await t.throwsAsync(
    updateLookV1(umi, {
      look,
      creator: stranger,
      lookId,
      ...noChange,
      price: some(1n),
    }).sendAndConfirm(umi),
    { name: 'NotLookCreator' }
  );
});

test('the wrong look id gets InvalidLookPdaDerivation', async (t) => {
  const umi = await createUmi();
  const { look, creator } = await registered(umi);
  await t.throwsAsync(
    updateLookV1(umi, {
      look,
      creator,
      lookId: 'other',
      ...noChange,
      price: some(1n),
    }).sendAndConfirm(umi),
    { name: 'InvalidLookPdaDerivation' }
  );
});

test('a 33-character look id gets InvalidLookId, not a panic', async (t) => {
  const umi = await createUmi();
  const { look, creator } = await registered(umi);
  await t.throwsAsync(
    updateLookV1(umi, {
      look,
      creator,
      lookId: 'a'.repeat(33),
      ...noChange,
      price: some(1n),
    }).sendAndConfirm(umi),
    { name: 'InvalidLookId' }
  );
});

test('an update with every option None gets InvalidLookData', async (t) => {
  const umi = await createUmi();
  const { look, creator, lookId } = await registered(umi);
  await t.throwsAsync(
    updateLookV1(umi, { look, creator, lookId, ...noChange }).sendAndConfirm(
      umi
    ),
    { name: 'InvalidLookData' }
  );
});

test('an empty uri update gets InvalidUri', async (t) => {
  const umi = await createUmi();
  const { look, creator, lookId } = await registered(umi);
  await t.throwsAsync(
    updateLookV1(umi, {
      look,
      creator,
      lookId,
      ...noChange,
      uri: some(''),
    }).sendAndConfirm(umi),
    { name: 'InvalidUri' }
  );
});

test('a merged USDC + Burn pair is rejected, whichever side changes', async (t) => {
  const umi = await createUmi();
  // Stored USDC transfer; switching only the price type to Burn.
  const usdc = await registered(umi);
  await t.throwsAsync(
    updateLookV1(umi, {
      look: usdc.look,
      creator: usdc.creator,
      lookId: usdc.lookId,
      ...noChange,
      priceType: some(PriceType.Burn),
    }).sendAndConfirm(umi),
    { name: 'BurnNotAllowedForMint' }
  );
  // Stored CRUMBS burn; switching only the mint to USDC.
  const crumbs = await registered(umi, {
    priceType: PriceType.Burn,
    price: 100,
    mint: CRUMBS_MINT,
  });
  await t.throwsAsync(
    updateLookV1(umi, {
      look: crumbs.look,
      creator: crumbs.creator,
      lookId: crumbs.lookId,
      ...noChange,
      paymentMintChoice: some(USDC_MINT),
    }).sendAndConfirm(umi),
    { name: 'BurnNotAllowedForMint' }
  );
  // Both sides at once is fine when the pair is valid.
  await updateLookV1(umi, {
    look: crumbs.look,
    creator: crumbs.creator,
    lookId: crumbs.lookId,
    ...noChange,
    priceType: some(PriceType.Transfer),
    paymentMintChoice: some(USDC_MINT),
  }).sendAndConfirm(umi);
  const { data } = await readData(umi, crumbs.look);
  t.like(data, { priceType: PriceType.Transfer, paymentMint: USDC_MINT });
});

test('an update without the creator signing gets AuthorityMustSign', async (t) => {
  const umi = await createUmi();
  const { look, creator, lookId } = await registered(umi);
  const ix = updateLookV1(umi, {
    look,
    creator,
    lookId,
    ...noChange,
    price: some(1n),
  });
  // Strip the creator's signer so its account meta is not a signer.
  const built = ix.items[0];
  built.instruction.keys = built.instruction.keys.map((k) =>
    k.pubkey === creator.publicKey ? { ...k, isSigner: false } : k
  );
  built.signers = built.signers.filter(
    (s) => s.publicKey !== creator.publicKey
  );
  await t.throwsAsync(ix.sendAndConfirm(umi), { name: 'AuthorityMustSign' });
});
