import {
  defaultPublicKey,
  generateSigner,
  publicKeyBytes,
} from '@metaplex-foundation/umi';
import test from 'ava';
import { AssetV1, transferV1 } from '@metaplex-foundation/mpl-core';
import {
  commissionMachineV1,
  fetchMachineOperator,
  findInsertedMachine,
  findMachinePda,
  insertCartridgeV2,
  insertedMachine,
  isInsertedIn,
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
