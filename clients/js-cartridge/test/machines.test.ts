import {
  Umi,
  PublicKey,
  defaultPublicKey,
  generateSigner,
  publicKeyBytes,
} from '@metaplex-foundation/umi';
import test from 'ava';
import {
  AssetV1,
  MPL_CORE_PROGRAM_ID,
  transferV1,
} from '@metaplex-foundation/mpl-core';
import {
  commissionMachineV1,
  fetchMachineOperator,
  findInsertedMachine,
  findMachinePda,
  insertCartridgeV2,
  insertedMachine,
  isInserted,
  isInsertedIn,
  isMachine,
  machineOperator,
  verifiedMachineOperator,
  readMachineData,
  removeCartridgeV2,
  setMachineOperatorV1,
} from '../src';
import {
  commissionMachine,
  createMachineCollection,
  createUmi,
  MACHINE_URI,
  printCartridge,
  releaseFreeGame,
} from './_setup';

/** A game, a cartridge of it and a machine, all owned by the identity. */
const setup = async () => {
  const umi = await createUmi();
  const game = await releaseFreeGame(umi);
  const cartridge = (await printCartridge(umi, game, umi.identity.publicKey))
    .publicKey;
  const machineCollection = await createMachineCollection(umi);
  const operator = generateSigner(umi).publicKey;
  const machine = await commissionMachine(umi, { machineCollection, operator });
  return { umi, game, cartridge, machineCollection, machine, operator };
};

test('readMachineData decodes v1 and rejects other layouts', async (t) => {
  const umi = await createUmi();
  const operator = generateSigner(umi).publicKey;

  t.deepEqual(
    readMachineData(Uint8Array.from([1, ...publicKeyBytes(operator)])),
    { version: 1, operator }
  );
  t.throws(() => readMachineData(new Uint8Array(32)), {
    message: /Unknown machine data layout/,
  });
  t.throws(
    () => readMachineData(Uint8Array.from([2, ...publicKeyBytes(operator)])),
    { message: /Invalid machine data version/ }
  );
});

test('insertedMachine reads a slot holding the cartridge itself as empty', async (t) => {
  // The retired insertCartridgeV1 wrote the cartridge's own key.
  const umi = await createUmi();
  const cartridge = generateSigner(umi).publicKey;
  const machine = generateSigner(umi).publicKey;
  const withLink = (link: Uint8Array) =>
    ({
      publicKey: cartridge,
      dataSections: [
        {
          type: 'DataSection',
          parentKey: {
            type: 'LinkedAppData',
            dataAuthority: { type: 'UpdateAuthority' },
          },
          data: link,
        },
      ],
    }) as unknown as AssetV1;

  t.is(insertedMachine(withLink(publicKeyBytes(cartridge))), null);
  t.is(insertedMachine(withLink(publicKeyBytes(machine))), machine);
  t.is(insertedMachine(withLink(new Uint8Array())), null);
});

test('fetchMachineOperator returns the operator until it is revoked', async (t) => {
  const { umi, machineCollection, machine, operator } = await setup();
  t.is(await fetchMachineOperator(umi, machine), operator);

  await setMachineOperatorV1(umi, {
    machine,
    machineCollection,
    owner: umi.identity,
    operator: defaultPublicKey(),
  }).sendAndConfirm(umi);

  t.is(await fetchMachineOperator(umi, machine), null);
});

test('fetchMachineOperator returns null when there is no operator to read', async (t) => {
  const { umi, cartridge, machineCollection } = await setup();

  // A V1 machine has no MachineData.
  await commissionMachineV1(umi, {
    name: 'V1 Machine',
    uri: MACHINE_URI,
    machineCollection,
    owner: umi.identity.publicKey,
  }).sendAndConfirm(umi);
  const [v1Machine] = findMachinePda(umi, {
    machineCollection,
    name: 'V1 Machine',
  });
  t.is(await fetchMachineOperator(umi, v1Machine), null);

  // A cartridge is a Core asset but not a machine.
  t.is(await fetchMachineOperator(umi, cartridge), null);

  // An address with no account.
  t.is(await fetchMachineOperator(umi, generateSigner(umi).publicKey), null);
});

test('findInsertedMachine follows insert and remove', async (t) => {
  const { umi, game, cartridge, machineCollection, machine } = await setup();
  t.is(await findInsertedMachine(umi, cartridge), null);

  await insertCartridgeV2(umi, {
    cartridge,
    game: game.game,
    owner: umi.identity,
    machine,
    machineCollection,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);
  t.is(await findInsertedMachine(umi, cartridge), machine);

  await removeCartridgeV2(umi, {
    cartridge,
    game: game.game,
    cartridgeOwner: umi.identity,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);
  t.is(await findInsertedMachine(umi, cartridge), null);
});

test('isInsertedIn is true only for the machine holding the cartridge', async (t) => {
  const { umi, game, cartridge, machineCollection, machine } = await setup();
  const otherMachine = await commissionMachine(umi, {
    machineCollection,
    name: 'Other Machine',
  });
  t.false(await isInsertedIn(umi, cartridge, machine));

  await insertCartridgeV2(umi, {
    cartridge,
    game: game.game,
    owner: umi.identity,
    machine,
    machineCollection,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);

  t.true(await isInsertedIn(umi, cartridge, machine));
  t.false(await isInsertedIn(umi, cartridge, otherMachine));
  t.false(await isInsertedIn(umi, cartridge, generateSigner(umi).publicKey));
});

test('isInsertedIn turns false when the machine changes owner', async (t) => {
  // Given a cartridge inserted in its owner's machine.
  const { umi, game, cartridge, machineCollection, machine } = await setup();
  await insertCartridgeV2(umi, {
    cartridge,
    game: game.game,
    owner: umi.identity,
    machine,
    machineCollection,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);
  t.true(await isInsertedIn(umi, cartridge, machine));

  // When the machine is transferred to someone else.
  await transferV1(umi, {
    asset: machine,
    collection: machineCollection,
    newOwner: generateSigner(umi).publicKey,
  }).sendAndConfirm(umi);

  // Then the slot still names the machine, but the link no longer counts.
  t.is(await findInsertedMachine(umi, cartridge), machine);
  t.false(await isInsertedIn(umi, cartridge, machine));
});

// ---- Hand-built assets: the genuine-machine gate and the `expect` options ----

const coreOwner = (umi: Umi) =>
  umi.programs.getPublicKey('mplCore', MPL_CORE_PROGRAM_ID);

/** A machine asset at the real PDA for (collection, name), carrying MachineData. */
const fakeMachine = (
  umi: Umi,
  o: {
    collection: PublicKey;
    name?: string;
    /** Address to use instead of the PDA. */
    address?: PublicKey;
    owner?: PublicKey;
    operator?: PublicKey;
    accountOwner?: PublicKey;
    claimedCollection?: PublicKey;
  }
): AssetV1 => {
  const name = o.name ?? 'Fake Machine';
  const [pda] = findMachinePda(umi, { machineCollection: o.collection, name });
  const address = o.address ?? pda;
  const operator = o.operator ?? generateSigner(umi).publicKey;
  return {
    publicKey: address,
    header: { owner: o.accountOwner ?? coreOwner(umi) },
    name,
    owner: o.owner ?? generateSigner(umi).publicKey,
    updateAuthority: {
      type: 'Collection',
      address: o.claimedCollection ?? o.collection,
    },
    appDatas: [
      {
        type: 'AppData',
        dataAuthority: { type: 'Address', address },
        data: Uint8Array.from([1, ...publicKeyBytes(operator)]),
      },
    ],
  } as unknown as AssetV1;
};

/** A cartridge asset whose link slot holds `link`. */
const fakeCartridge = (
  umi: Umi,
  o: {
    link: PublicKey;
    owner: PublicKey;
    game?: PublicKey;
    address?: PublicKey;
  }
): AssetV1 =>
  ({
    publicKey: o.address ?? generateSigner(umi).publicKey,
    header: { owner: coreOwner(umi) },
    owner: o.owner,
    updateAuthority: {
      type: 'Collection',
      address: o.game ?? generateSigner(umi).publicKey,
    },
    dataSections: [
      {
        type: 'DataSection',
        parentKey: {
          type: 'LinkedAppData',
          dataAuthority: { type: 'UpdateAuthority' },
        },
        data: publicKeyBytes(o.link),
      },
    ],
  }) as unknown as AssetV1;

test('a forged MachineData on an asset that is not at the machine PDA gives no operator', async (t) => {
  const umi = await createUmi();
  const collection = generateSigner(umi).publicKey;
  const genuine = fakeMachine(umi, { collection });
  t.not(verifiedMachineOperator(umi, genuine), null);

  // Same well-formed AppData (authority is its own key), wrong address.
  const forged = fakeMachine(umi, {
    collection,
    address: generateSigner(umi).publicKey,
  });
  t.not(machineOperator(forged), null); // the raw reader does not verify
  t.is(verifiedMachineOperator(umi, forged), null);
});

test('isInserted is false when the slot names a Core asset that is not a machine', async (t) => {
  const umi = await createUmi();
  const owner = generateSigner(umi).publicKey;
  const collection = generateSigner(umi).publicKey;
  const notMachine = fakeMachine(umi, {
    collection,
    owner,
    address: generateSigner(umi).publicKey,
  });
  const cartridge = fakeCartridge(umi, { link: notMachine.publicKey, owner });
  t.false(isInserted(umi, { cartridge, machine: notMachine }));

  // Control: the same shape at the real PDA is accepted.
  const machine = fakeMachine(umi, { collection, owner });
  t.true(
    isInserted(umi, {
      cartridge: fakeCartridge(umi, { link: machine.publicKey, owner }),
      machine,
    })
  );
});

test('isMachine rejects a name or collection that does not match the PDA', async (t) => {
  const umi = await createUmi();
  const collection = generateSigner(umi).publicKey;
  const other = generateSigner(umi).publicKey;
  const machine = fakeMachine(umi, { collection, name: 'Right' });
  t.true(isMachine(umi, machine));

  // Right collection, wrong name.
  t.false(isMachine(umi, { ...machine, name: 'Wrong' } as AssetV1));
  // Right name, other collection.
  t.false(
    isMachine(umi, {
      ...machine,
      updateAuthority: { type: 'Collection', address: other },
    } as AssetV1)
  );
  // Not collection-owned at all.
  t.false(
    isMachine(umi, {
      ...machine,
      updateAuthority: { type: 'Address', address: collection },
    } as AssetV1)
  );
});

test('an account not owned by mpl-core is not a machine', async (t) => {
  const umi = await createUmi();
  const collection = generateSigner(umi).publicKey;
  const machine = fakeMachine(umi, {
    collection,
    accountOwner: generateSigner(umi).publicKey,
  });
  t.false(isMachine(umi, machine));
  t.is(verifiedMachineOperator(umi, machine), null);
});

test('isInserted is false when the slot holds the cartridge own key', async (t) => {
  const umi = await createUmi();
  const owner = generateSigner(umi).publicKey;
  const machine = fakeMachine(umi, {
    collection: generateSigner(umi).publicKey,
    owner,
  });
  const address = generateSigner(umi).publicKey;
  t.false(
    isInserted(umi, {
      cartridge: fakeCartridge(umi, { link: address, address, owner }),
      machine,
    })
  );
});

test('the sync helpers apply the expect options', async (t) => {
  const umi = await createUmi();
  const owner = generateSigner(umi).publicKey;
  const collection = generateSigner(umi).publicKey;
  const game = generateSigner(umi).publicKey;
  const wrong = generateSigner(umi).publicKey;
  const machine = fakeMachine(umi, { collection, owner });
  const cartridge = fakeCartridge(umi, {
    link: machine.publicKey,
    owner,
    game,
  });
  const input = { cartridge, machine };

  t.true(isInserted(umi, input));
  t.true(isInserted(umi, input, { machineCollection: collection, game }));
  t.true(isInserted(umi, input, { machineCollection: collection }));
  t.true(isInserted(umi, input, { game }));
  t.false(isInserted(umi, input, { machineCollection: wrong }));
  t.false(isInserted(umi, input, { game: wrong }));
  t.false(
    isInserted(umi, input, { machineCollection: collection, game: wrong })
  );

  t.true(isMachine(umi, machine, { machineCollection: collection }));
  t.false(isMachine(umi, machine, { machineCollection: wrong }));

  t.not(machineOperator(machine, { machineCollection: collection }), null);
  t.is(machineOperator(machine, { machineCollection: wrong }), null);
  t.not(
    verifiedMachineOperator(umi, machine, { machineCollection: collection }),
    null
  );
  t.is(
    verifiedMachineOperator(umi, machine, { machineCollection: wrong }),
    null
  );
});

test('on-chain: expect pins the machine collection and the game', async (t) => {
  const { umi, game, cartridge, machineCollection, machine, operator } =
    await setup();
  await insertCartridgeV2(umi, {
    cartridge,
    game: game.game,
    owner: umi.identity,
    machine,
    machineCollection,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);
  const wrong = generateSigner(umi).publicKey;

  t.true(
    await isInsertedIn(umi, cartridge, machine, {
      machineCollection,
      game: game.game,
    })
  );
  t.false(
    await isInsertedIn(umi, cartridge, machine, {
      machineCollection: wrong,
      game: game.game,
    })
  );
  t.false(
    await isInsertedIn(umi, cartridge, machine, {
      machineCollection,
      game: wrong,
    })
  );

  t.is(
    await fetchMachineOperator(umi, machine, { machineCollection }),
    operator
  );
  t.is(
    await fetchMachineOperator(umi, machine, { machineCollection: wrong }),
    null
  );
});
