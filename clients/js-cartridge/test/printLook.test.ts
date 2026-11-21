import {
  generateSigner,
  publicKey,
  PublicKey,
  Signer,
  sol,
  Umi,
} from '@metaplex-foundation/umi';
import {
  createIdempotentAssociatedToken,
  fetchMint,
  fetchToken,
  findAssociatedTokenPda,
} from '@metaplex-foundation/mpl-toolbox';
import test from 'ava';
import {
  create,
  createCollection,
  fetchAsset,
  fetchCollection,
} from '@metaplex-foundation/mpl-core';
import {
  CRUMBS_MINT,
  USDC_MINT,
  findAssetSignerPda,
  findLookPaymentAccounts,
  isOfficialLook,
  PriceType,
  printLookV1,
  readLookData,
} from '../src';
import {
  createUmi,
  fundToken,
  fundUsdc,
  LOOK_NAME,
  LOOK_URI,
  printCartridge,
  registerTestLook,
  releaseFreeGame,
} from './_setup';

const ata = (umi: Umi, mint: PublicKey, owner: PublicKey) =>
  findAssociatedTokenPda(umi, { mint, owner })[0];

const makeAta = async (umi: Umi, mint: PublicKey, owner: PublicKey) => {
  const token = ata(umi, mint, owner);
  await createIdempotentAssociatedToken(umi, {
    mint,
    owner,
    ata: token,
  }).sendAndConfirm(umi);
  return token;
};

/** A free game, a cartridge owned by a fresh `owner`, and a registered look. */
const setup = async (
  umi: Umi,
  look: Parameters<typeof registerTestLook>[2] = {}
) => {
  const game = await releaseFreeGame(umi);
  const owner = generateSigner(umi);
  await umi.rpc.airdrop(owner.publicKey, sol(1));
  const cartridge = await printCartridge(umi, game, owner.publicKey);
  const registered = await registerTestLook(umi, game, look);
  await registered.builder.sendAndConfirm(umi);
  const collection = await fetchCollection(umi, registered.look);
  const data = readLookData(collection.dataSections![0].data!);
  return { game, owner, cartridge, ...registered, data };
};

type Setup = Awaited<ReturnType<typeof setup>>;

/** Arguments for a valid print: `payer` pays, `s.owner` co-signs. */
const printArgs = (umi: Umi, s: Setup, payer: Signer, copy: Signer) => ({
  copy,
  look: s.look,
  cartridge: s.cartridge.publicKey,
  owner: s.owner,
  recipient: findAssetSignerPda(umi, { asset: s.cartridge.publicKey }),
  payer,
  lookId: s.lookId,
  ...findLookPaymentAccounts(umi, { payer: payer.publicKey, data: s.data }),
});

test('a USDC print pays the creator and mints a frozen copy to the asset signer', async (t) => {
  const umi = await createUmi();
  const s = await setup(umi, { price: 1_500_000 });
  await fundUsdc(umi, umi.identity.publicKey, 5_000_000n);
  const creatorAta = await makeAta(umi, USDC_MINT, s.creator.publicKey);
  const payerAta = ata(umi, USDC_MINT, umi.identity.publicKey);
  const before = (await fetchToken(umi, payerAta)).amount;

  // The owner co-signs while umi.identity pays.
  const copy = generateSigner(umi);
  await printLookV1(umi, printArgs(umi, s, umi.payer, copy)).sendAndConfirm(
    umi
  );

  t.is((await fetchToken(umi, creatorAta)).amount, 1_500_000n);
  t.is((await fetchToken(umi, payerAta)).amount, before - 1_500_000n);

  const asset = await fetchAsset(umi, copy.publicKey);
  t.is(asset.name, `${LOOK_NAME} 1`);
  t.is(asset.uri, LOOK_URI);
  t.is(
    asset.owner,
    publicKey(findAssetSignerPda(umi, { asset: s.cartridge.publicKey }))
  );
  t.deepEqual(asset.updateAuthority, { type: 'Collection', address: s.look });
  t.is(asset.edition?.number, 1);
  t.like(asset.permanentFreezeDelegate, {
    frozen: true,
    authority: { type: 'UpdateAuthority' },
  });
  t.is((await fetchCollection(umi, s.look)).numMinted, 1);

  // A second print is edition 2.
  const copy2 = generateSigner(umi);
  await printLookV1(umi, printArgs(umi, s, umi.payer, copy2)).sendAndConfirm(
    umi
  );
  const asset2 = await fetchAsset(umi, copy2.publicKey);
  t.is(asset2.name, `${LOOK_NAME} 2`);
  t.is(asset2.edition?.number, 2);
});

// Serial: the supply check would race other tests that mint CRUMBS.
test.serial('a CRUMBS burn print lowers the payer balance and supply', async (t) => {
  const umi = await createUmi();
  const s = await setup(umi, {
    lookId: 'crumbs-look',
    priceType: PriceType.Burn,
    price: 1,
    mint: CRUMBS_MINT,
  });
  await fundToken(umi, CRUMBS_MINT, umi.identity.publicKey, 10n);
  const payerAta = ata(umi, CRUMBS_MINT, umi.identity.publicKey);
  const beforeBalance = (await fetchToken(umi, payerAta)).amount;
  const beforeSupply = (await fetchMint(umi, CRUMBS_MINT)).supply;

  const copy = generateSigner(umi);
  await printLookV1(umi, printArgs(umi, s, umi.payer, copy)).sendAndConfirm(
    umi
  );

  t.is((await fetchToken(umi, payerAta)).amount, beforeBalance - 1n);
  t.is((await fetchMint(umi, CRUMBS_MINT)).supply, beforeSupply - 1n);
  t.true(await umi.rpc.accountExists(copy.publicKey));
});

test('a CRUMBS burn print ignores a non-token creatorTokenAccount', async (t) => {
  const umi = await createUmi();
  const s = await setup(umi, {
    lookId: 'crumbs-look',
    priceType: PriceType.Burn,
    price: 1,
    mint: CRUMBS_MINT,
  });
  await fundToken(umi, CRUMBS_MINT, umi.identity.publicKey, 10n);
  const copy = generateSigner(umi);
  await printLookV1(umi, {
    ...printArgs(umi, s, umi.payer, copy),
    creatorTokenAccount: generateSigner(umi).publicKey,
  }).sendAndConfirm(umi);
  t.true(await umi.rpc.accountExists(copy.publicKey));
});

test('a print is refused for each bad account', async (t) => {
  const umi = await createUmi();
  const s = await setup(umi, { price: 1_000 });
  await fundUsdc(umi, umi.identity.publicKey, 5_000_000n);
  await makeAta(umi, USDC_MINT, s.creator.publicKey);
  const args = () => printArgs(umi, s, umi.payer, generateSigner(umi));

  // A signer who does not own the cartridge.
  await t.throwsAsync(
    printLookV1(umi, { ...args(), owner: generateSigner(umi) }).sendAndConfirm(
      umi
    ),
    { name: 'NotCartridgeOwner' }
  );

  // A cartridge from another game.
  const other = await setup(umi, { price: 1_000 });
  await t.throwsAsync(
    printLookV1(umi, {
      ...args(),
      cartridge: other.cartridge.publicKey,
      owner: other.owner,
      recipient: findAssetSignerPda(umi, { asset: other.cartridge.publicKey }),
    }).sendAndConfirm(umi),
    { name: 'CartridgeNotInGame' }
  );

  // The owner wallet instead of the asset signer as recipient.
  await t.throwsAsync(
    printLookV1(umi, {
      ...args(),
      recipient: s.owner.publicKey,
    }).sendAndConfirm(umi),
    { name: 'InvalidAssetSigner' }
  );

  // The payer's own ATA as the creator's token account.
  await t.throwsAsync(
    printLookV1(umi, {
      ...args(),
      creatorTokenAccount: ata(umi, USDC_MINT, umi.identity.publicKey),
    }).sendAndConfirm(umi),
    { name: 'InvalidCreatorTokenAccount' }
  );

  // The wrong look id.
  await t.throwsAsync(
    printLookV1(umi, { ...args(), lookId: 'other' }).sendAndConfirm(umi),
    { name: 'InvalidLookPdaDerivation' }
  );

  // A 33-character look id.
  await t.throwsAsync(
    printLookV1(umi, { ...args(), lookId: 'a'.repeat(33) }).sendAndConfirm(umi),
    { name: 'InvalidLookId' }
  );
});

test('isOfficialLook is false for a spoof and true for a real copy collection', async (t) => {
  const umi = await createUmi();
  const s = await setup(umi, { price: 1_000 });
  await fundUsdc(umi, umi.identity.publicKey, 5_000_000n);
  await makeAta(umi, USDC_MINT, s.creator.publicKey);
  const copy = generateSigner(umi);
  await printLookV1(umi, printArgs(umi, s, umi.payer, copy)).sendAndConfirm(
    umi
  );

  // A real printed copy points at the official look collection.
  const realCopy = await fetchAsset(umi, copy.publicKey);
  t.is(realCopy.updateAuthority.type, 'Collection');
  const realCollection = await fetchCollection(umi, s.look);
  t.true(
    isOfficialLook(umi, {
      collection: realCollection,
      lookId: s.lookId,
      game: s.game.game,
    })
  );
  // ...but not under another id or game.
  t.false(
    isOfficialLook(umi, {
      collection: realCollection,
      lookId: 'other',
      game: s.game.game,
    })
  );
  t.false(
    isOfficialLook(umi, {
      collection: realCollection,
      lookId: s.lookId,
      game: generateSigner(umi).publicKey,
    })
  );

  // A plain Core collection with an asset owned by the same asset signer.
  const fakeCollection = generateSigner(umi);
  await createCollection(umi, {
    collection: fakeCollection,
    name: LOOK_NAME,
    uri: LOOK_URI,
  }).sendAndConfirm(umi);
  const fakeAsset = generateSigner(umi);
  await create(umi, {
    asset: fakeAsset,
    collection: await fetchCollection(umi, fakeCollection.publicKey),
    name: `${LOOK_NAME} 1`,
    uri: LOOK_URI,
    owner: findAssetSignerPda(umi, { asset: s.cartridge.publicKey }),
  }).sendAndConfirm(umi);
  t.false(
    isOfficialLook(umi, {
      collection: await fetchCollection(umi, fakeCollection.publicKey),
      lookId: s.lookId,
      game: s.game.game,
    })
  );
});
