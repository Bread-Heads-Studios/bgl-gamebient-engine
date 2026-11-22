import {
  generateSigner,
  none,
  publicKey,
  PublicKey,
  Signer,
  sol,
  some,
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
  ExternalPluginAdapterSchema,
  fetchAsset,
  fetchCollection,
  writeCollectionExternalPluginAdapterDataV1,
} from '@metaplex-foundation/mpl-core';
import {
  CRUMBS_MINT,
  USDC_MINT,
  findAssetSignerPda,
  findLookPaymentAccounts,
  getLookDataSerializer,
  isLookCopyFor,
  isOfficialLook,
  LookData,
  prepareLookPayment,
  PriceType,
  printLookV1,
  readLookData,
  updateLookV1,
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
  maxPrice: s.data.price,
  ...findLookPaymentAccounts(umi, { payer: payer.publicKey, data: s.data }),
});

test('a USDC print pays the creator and mints a frozen copy to the asset signer', async (t) => {
  const umi = await createUmi();
  const s = await setup(umi, { price: 1_500_000 });
  await fundUsdc(umi, umi.identity.publicKey, 5_000_000n);
  // The creator has no USDC account yet; prepareLookPayment creates it.
  const creatorAta = ata(umi, USDC_MINT, s.creator.publicKey);
  t.false(await umi.rpc.accountExists(creatorAta));
  const payerAta = ata(umi, USDC_MINT, umi.identity.publicKey);
  const before = (await fetchToken(umi, payerAta)).amount;

  // The owner co-signs while umi.identity pays.
  const copy = generateSigner(umi);
  await (await prepareLookPayment(umi, { payer: umi.payer, data: s.data }))
    .add(printLookV1(umi, printArgs(umi, s, umi.payer, copy)))
    .sendAndConfirm(umi);

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

  // A second print is edition 2. The creator's ATA now exists, so
  // prepareLookPayment adds nothing.
  const copy2 = generateSigner(umi);
  await (await prepareLookPayment(umi, { payer: umi.payer, data: s.data }))
    .add(printLookV1(umi, printArgs(umi, s, umi.payer, copy2)))
    .sendAndConfirm(umi);
  t.is((await fetchToken(umi, creatorAta)).amount, 3_000_000n);
  const asset2 = await fetchAsset(umi, copy2.publicKey);
  t.is(asset2.name, `${LOOK_NAME} 2`);
  t.is(asset2.edition?.number, 2);
});

// Serial: the supply check would race other tests that mint CRUMBS.
test.serial(
  'a CRUMBS burn print lowers the payer balance and supply',
  async (t) => {
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
  }
);

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
      creator: s.creator.publicKey,
    })
  );
  // ...but not under another id, game or creator.
  t.false(
    isOfficialLook(umi, {
      collection: realCollection,
      lookId: 'other',
      game: s.game.game,
      creator: s.creator.publicKey,
    })
  );
  t.false(
    isOfficialLook(umi, {
      collection: realCollection,
      lookId: s.lookId,
      game: generateSigner(umi).publicKey,
      creator: s.creator.publicKey,
    })
  );
  t.false(
    isOfficialLook(umi, {
      collection: realCollection,
      lookId: s.lookId,
      game: s.game.game,
      creator: generateSigner(umi).publicKey,
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
      creator: s.creator.publicKey,
    })
  );
});

test('a print is refused when the price rose above maxPrice', async (t) => {
  const umi = await createUmi();
  const s = await setup(umi, { price: 1_000 });
  await fundUsdc(umi, umi.identity.publicKey, 5_000_000n);
  await makeAta(umi, USDC_MINT, s.creator.publicKey);

  // The creator raises the price after the buyer was quoted 1_000.
  await updateLookV1(umi, {
    look: s.look,
    creator: s.creator,
    lookId: s.lookId,
    uri: none(),
    contentHash: none(),
    priceType: none(),
    price: some(1_001n),
    paymentMintChoice: none(),
  }).sendAndConfirm(umi);

  await t.throwsAsync(
    printLookV1(umi, {
      ...printArgs(umi, s, umi.payer, generateSigner(umi)),
      maxPrice: 1_000,
    }).sendAndConfirm(umi),
    { name: 'LookPriceChanged' }
  );

  // A buyer who accepts the new price can print.
  const copy = generateSigner(umi);
  await printLookV1(umi, {
    ...printArgs(umi, s, umi.payer, copy),
    maxPrice: 1_001,
  }).sendAndConfirm(umi);
  t.true(await umi.rpc.accountExists(copy.publicKey));
  t.is(
    (await fetchToken(umi, ata(umi, USDC_MINT, s.creator.publicKey))).amount,
    1_001n
  );
});

test('isOfficialLook is false for a collection off the look PDA holding real LookData', async (t) => {
  const umi = await createUmi();
  const s = await setup(umi, { price: 1_000 });

  // A plain Core collection whose LinkedAppData holds a copy of the real
  // look's bytes: right game, right creator, wrong address.
  const fake = generateSigner(umi);
  await createCollection(umi, {
    collection: fake,
    name: LOOK_NAME,
    uri: LOOK_URI,
    plugins: [
      {
        type: 'LinkedAppData',
        dataAuthority: { type: 'UpdateAuthority' },
        schema: ExternalPluginAdapterSchema.Binary,
      },
    ],
  }).sendAndConfirm(umi);
  const bytes = getLookDataSerializer().serialize(s.data as LookData);
  await writeCollectionExternalPluginAdapterDataV1(umi, {
    collection: fake.publicKey,
    authority: umi.identity,
    key: {
      __kind: 'LinkedAppData',
      fields: [{ __kind: 'UpdateAuthority' }],
    },
    data: some(bytes),
  }).sendAndConfirm(umi);

  const fakeCollection = await fetchCollection(umi, fake.publicKey);
  // The bytes decode to the real game and creator; only the PDA check fails.
  const fakeData = readLookData(fakeCollection.dataSections![0].data!);
  t.is(fakeData.game, s.game.game);
  t.is(fakeData.creator, s.creator.publicKey);
  t.false(
    isOfficialLook(umi, {
      collection: fakeCollection,
      game: s.game.game,
      creator: s.creator.publicKey,
      lookId: s.lookId,
    })
  );
});

test('a same-id squatter look is official only under its own creator', async (t) => {
  const umi = await createUmi();
  const s = await setup(umi, { price: 1_000 });

  // Another creator registers the same look id for the same game...
  const squat = await registerTestLook(umi, s.game, {
    lookId: s.lookId,
    price: 1_000,
  });
  await squat.builder.sendAndConfirm(umi);
  const squatCollection = await fetchCollection(umi, squat.look);
  const squatData = readLookData(squatCollection.dataSections![0].data!);

  // ...and prints it into their own cartridge.
  const squatter = generateSigner(umi);
  await umi.rpc.airdrop(squatter.publicKey, sol(1));
  const squatCartridge = await printCartridge(umi, s.game, squatter.publicKey);
  await fundUsdc(umi, umi.identity.publicKey, 5_000_000n);
  const copy = generateSigner(umi);
  await (
    await prepareLookPayment(umi, { payer: umi.payer, data: squatData })
  )
    .add(
      printLookV1(umi, {
        copy,
        look: squat.look,
        cartridge: squatCartridge.publicKey,
        owner: squatter,
        recipient: findAssetSignerPda(umi, {
          asset: squatCartridge.publicKey,
        }),
        payer: umi.payer,
        lookId: s.lookId,
        maxPrice: squatData.price,
        ...findLookPaymentAccounts(umi, {
          payer: umi.identity.publicKey,
          data: squatData,
        }),
      })
    )
    .sendAndConfirm(umi);

  const real = {
    game: s.game.game,
    creator: s.creator.publicKey,
    lookId: s.lookId,
  };
  const own = { ...real, creator: squat.creator.publicKey };
  t.false(isOfficialLook(umi, { collection: squatCollection, ...real }));
  t.true(isOfficialLook(umi, { collection: squatCollection, ...own }));
  const held = { asset: copy.publicKey, cartridge: squatCartridge.publicKey };
  t.false(await isLookCopyFor(umi, { ...held, ...real }));
  t.true(await isLookCopyFor(umi, { ...held, ...own }));
});

test('isLookCopyFor checks the look and the holder', async (t) => {
  const umi = await createUmi();
  const s = await setup(umi, { price: 1_000 });
  await fundUsdc(umi, umi.identity.publicKey, 5_000_000n);
  await makeAta(umi, USDC_MINT, s.creator.publicKey);
  const copy = generateSigner(umi);
  await printLookV1(umi, printArgs(umi, s, umi.payer, copy)).sendAndConfirm(
    umi
  );
  const look = {
    game: s.game.game,
    creator: s.creator.publicKey,
    lookId: s.lookId,
  };

  // The real copy in the cartridge it was printed into.
  t.true(
    await isLookCopyFor(umi, {
      asset: copy.publicKey,
      cartridge: s.cartridge.publicKey,
      ...look,
    })
  );

  // Another cartridge of the same game: the copy is not in its signer.
  const otherCartridge = await printCartridge(umi, s.game, s.owner.publicKey);
  t.false(
    await isLookCopyFor(umi, {
      asset: copy.publicKey,
      cartridge: otherCartridge.publicKey,
      ...look,
    })
  );

  // A cartridge from another game. The program refuses to print this look
  // into it, and copies are frozen, so no such cartridge can hold a copy: the
  // check fails on the holder before the cartridge game check is reached.
  const other = await setup(umi, { price: 1_000 });
  t.false(
    await isLookCopyFor(umi, {
      asset: copy.publicKey,
      cartridge: other.cartridge.publicKey,
      ...look,
    })
  );

  // A real copy of the other game's look in its own cartridge passes for
  // that look and fails for this one.
  await makeAta(umi, USDC_MINT, other.creator.publicKey);
  const otherCopy = generateSigner(umi);
  await printLookV1(
    umi,
    printArgs(umi, other, umi.payer, otherCopy)
  ).sendAndConfirm(umi);
  t.true(
    await isLookCopyFor(umi, {
      asset: otherCopy.publicKey,
      cartridge: other.cartridge.publicKey,
      game: other.game.game,
      creator: other.creator.publicKey,
      lookId: other.lookId,
    })
  );
  t.false(
    await isLookCopyFor(umi, {
      asset: otherCopy.publicKey,
      cartridge: other.cartridge.publicKey,
      ...look,
    })
  );

  // A missing asset.
  t.false(
    await isLookCopyFor(umi, {
      asset: generateSigner(umi).publicKey,
      cartridge: s.cartridge.publicKey,
      ...look,
    })
  );
});
