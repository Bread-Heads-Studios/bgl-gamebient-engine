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
  t.is(
    await fetchMachineOperator(umi, machine, { machineCollection }),
    operator
  );

  await setMachineOperatorV1(umi, {
    machine,
    machineCollection,
    owner: umi.identity,
    operator: defaultPublicKey(),
  }).sendAndConfirm(umi);

  t.is(await fetchMachineOperator(umi, machine, { machineCollection }), null);
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
  t.is(await fetchMachineOperator(umi, v1Machine, { machineCollection }), null);

  // A cartridge is a Core asset but not a machine.
  t.is(await fetchMachineOperator(umi, cartridge, { machineCollection }), null);

  // An address with no account.
  t.is(
    await fetchMachineOperator(umi, generateSigner(umi).publicKey, {
      machineCollection,
    }),
    null
  );
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
  const expect = { machineCollection, game: game.game };
  const otherMachine = await commissionMachine(umi, {
    machineCollection,
    name: 'Other Machine',
  });
  t.false(await isInsertedIn(umi, cartridge, machine, expect));

  await insertCartridgeV2(umi, {
    cartridge,
    game: game.game,
    owner: umi.identity,
    machine,
    machineCollection,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);

  t.true(await isInsertedIn(umi, cartridge, machine, expect));
  t.false(await isInsertedIn(umi, cartridge, otherMachine, expect));
  t.false(
    await isInsertedIn(umi, cartridge, generateSigner(umi).publicKey, expect)
  );
});

test('isInsertedIn turns false when the machine changes owner', async (t) => {
  // Given a cartridge inserted in its owner's machine.
  const { umi, game, cartridge, machineCollection, machine } = await setup();
  const expect = { machineCollection, game: game.game };
  await insertCartridgeV2(umi, {
    cartridge,
    game: game.game,
    owner: umi.identity,
    machine,
    machineCollection,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);
  t.true(await isInsertedIn(umi, cartridge, machine, expect));

  // When the machine is transferred to someone else.
  await transferV1(umi, {
    asset: machine,
    collection: machineCollection,
    newOwner: generateSigner(umi).publicKey,
  }).sendAndConfirm(umi);

  // Then the slot still names the machine, but the link no longer counts.
  t.is(await findInsertedMachine(umi, cartridge), machine);
  t.false(await isInsertedIn(umi, cartridge, machine, expect));
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
  const expect = { machineCollection: collection };
  const genuine = fakeMachine(umi, { collection });
  t.not(verifiedMachineOperator(umi, genuine, expect), null);

  // Same well-formed AppData (authority is its own key), wrong address.
  const forged = fakeMachine(umi, {
    collection,
    address: generateSigner(umi).publicKey,
  });
  t.not(machineOperator(forged), null); // the raw reader does not verify
  t.is(verifiedMachineOperator(umi, forged, expect), null);
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
  const game = generateSigner(umi).publicKey;
  const expect = { machineCollection: collection, game };
  const cartridge = fakeCartridge(umi, {
    link: notMachine.publicKey,
    owner,
    game,
  });
  t.false(isInserted(umi, { cartridge, machine: notMachine }, expect));

  // Control: the same shape at the real PDA is accepted.
  const machine = fakeMachine(umi, { collection, owner });
  t.true(
    isInserted(
      umi,
      {
        cartridge: fakeCartridge(umi, { link: machine.publicKey, owner, game }),
        machine,
      },
      expect
    )
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
  t.is(
    verifiedMachineOperator(umi, machine, { machineCollection: collection }),
    null
  );
});

test('isInserted is false when the slot holds the cartridge own key', async (t) => {
  const umi = await createUmi();
  const owner = generateSigner(umi).publicKey;
  const collection = generateSigner(umi).publicKey;
  const game = generateSigner(umi).publicKey;
  const machine = fakeMachine(umi, { collection, owner });
  const address = generateSigner(umi).publicKey;
  t.false(
    isInserted(
      umi,
      {
        cartridge: fakeCartridge(umi, { link: address, address, owner, game }),
        machine,
      },
      { machineCollection: collection, game }
    )
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

  t.true(isInserted(umi, input, { machineCollection: collection, game }));
  t.false(isInserted(umi, input, { machineCollection: wrong, game }));
  t.false(
    isInserted(umi, input, { machineCollection: collection, game: wrong })
  );
  t.false(isInserted(umi, input, { machineCollection: wrong, game: wrong }));

  t.true(isMachine(umi, machine));
  t.true(isMachine(umi, machine, { machineCollection: collection }));
  t.false(isMachine(umi, machine, { machineCollection: wrong }));

  t.not(
    verifiedMachineOperator(umi, machine, { machineCollection: collection }),
    null
  );
  t.is(
    verifiedMachineOperator(umi, machine, { machineCollection: wrong }),
    null
  );

  // The raw reader takes no pin and verifies nothing.
  t.not(machineOperator(machine), null);
});

test('the sync gates fail closed when a pin is missing or empty', async (t) => {
  const umi = await createUmi();
  const owner = generateSigner(umi).publicKey;
  const collection = generateSigner(umi).publicKey;
  const game = generateSigner(umi).publicKey;
  const machine = fakeMachine(umi, { collection, owner });
  const cartridge = fakeCartridge(umi, {
    link: machine.publicKey,
    owner,
    game,
  });
  const input = { cartridge, machine };
  // Control: the correct pins pass.
  t.true(isInserted(umi, input, { machineCollection: collection, game }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gate = isInserted as any;
  for (const bad of [
    undefined,
    null,
    {},
    { machineCollection: undefined, game },
    { machineCollection: collection, game: undefined },
    { machineCollection: collection },
    { game },
    { machineCollection: '', game },
    { machineCollection: collection, game: '' },
    { machineCollection: null, game },
  ]) {
    t.false(gate(umi, input, bad), JSON.stringify(bad));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const operator = verifiedMachineOperator as any;
  for (const bad of [
    undefined,
    null,
    {},
    { machineCollection: undefined },
    { machineCollection: null },
    { machineCollection: '' },
  ]) {
    t.is(operator(umi, machine, bad), null, JSON.stringify(bad));
  }

  // isMachine keeps `expect` optional, but a present-and-falsy pin is false.
  t.true(isMachine(umi, machine));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isM = isMachine as any;
  t.true(isM(umi, machine, {}));
  t.false(isM(umi, machine, { machineCollection: undefined }));
  t.false(isM(umi, machine, { machineCollection: null }));
  t.false(isM(umi, machine, { machineCollection: '' }));
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

  // Missing or empty pins fail closed even for a genuinely inserted cartridge.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inserted = isInsertedIn as any;
  for (const bad of [
    undefined,
    {},
    { machineCollection: undefined, game: game.game },
    { machineCollection, game: undefined },
    { machineCollection },
    { game: game.game },
    { machineCollection: '', game: game.game },
  ]) {
    t.false(await inserted(umi, cartridge, machine, bad), JSON.stringify(bad));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchOp = fetchMachineOperator as any;
  for (const bad of [
    undefined,
    {},
    { machineCollection: undefined },
    { machineCollection: '' },
  ]) {
    t.is(await fetchOp(umi, machine, bad), null, JSON.stringify(bad));
  }
});
