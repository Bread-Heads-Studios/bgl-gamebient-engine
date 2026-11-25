import {
  generateSigner,
  PublicKey,
  publicKeyBytes,
  Signer,
  sol,
  Umi,
} from '@metaplex-foundation/umi';
import test from 'ava';
import { fetchAsset } from '@metaplex-foundation/mpl-core';
import {
  insertCartridgeV1,
  insertCartridgeV2,
  removeCartridgeV1,
  removeCartridgeV2,
} from '../src';
import {
  commissionMachine,
  coreFailed,
  CORE_INVALID_COLLECTION,
  createMachineCollection,
  createUmi,
  fetchMachineData,
  printCartridge,
  rejectionLogs,
  releaseFreeGame,
} from './_setup';

/**
 * The bytes in the cartridge's link slot: undefined if the slot was never
 * written, [] once cleared.
 */
const linkBytes = async (
  umi: Umi,
  cartridge: PublicKey
): Promise<number[] | undefined> => {
  const asset = await fetchAsset(umi, cartridge, { skipDerivePlugins: true });
  const section = asset.dataSections?.find(
    (d) => d.parentKey.type === 'LinkedAppData'
  );
  return section ? Array.from(section.data as Uint8Array) : undefined;
};

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

test('it inserts a cartridge into a machine', async (t) => {
  // Given a cartridge that was never inserted.
  const { umi, game, cartridge, machineCollection, machine, operator } =
    await setup();
  t.is(await linkBytes(umi, cartridge), undefined);

  // When its owner inserts it into their machine.
  await insertCartridgeV2(umi, {
    cartridge,
    game: game.game,
    owner: umi.identity,
    machine,
    machineCollection,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);

  // Then the cartridge's link slot holds the machine's address.
  t.deepEqual(
    await linkBytes(umi, cartridge),
    Array.from(publicKeyBytes(machine))
  );

  // And the machine is untouched.
  t.deepEqual(await fetchMachineData(umi, machine), { version: 1, operator });
});

test('a machine holds more than one cartridge', async (t) => {
  const { umi, game, cartridge, machineCollection, machine } = await setup();
  const second = (await printCartridge(umi, game, umi.identity.publicKey))
    .publicKey;

  await insertCartridgeV2(umi, {
    cartridge,
    game: game.game,
    owner: umi.identity,
    machine,
    machineCollection,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);
  await insertCartridgeV2(umi, {
    cartridge: second,
    game: game.game,
    owner: umi.identity,
    machine,
    machineCollection,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);

  t.deepEqual(
    await linkBytes(umi, cartridge),
    Array.from(publicKeyBytes(machine))
  );
  t.deepEqual(
    await linkBytes(umi, second),
    Array.from(publicKeyBytes(machine))
  );
});

test('someone else can pay for the insert', async (t) => {
  const { umi, game, cartridge, machineCollection, machine } = await setup();
  const sponsor = generateSigner(umi);
  await umi.rpc.airdrop(sponsor.publicKey, sol(10));

  await insertCartridgeV2(umi, {
    cartridge,
    game: game.game,
    owner: umi.identity,
    machine,
    machineCollection,
    payer: sponsor,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);

  t.deepEqual(
    await linkBytes(umi, cartridge),
    Array.from(publicKeyBytes(machine))
  );
});

test('it fails to insert a cartridge that is already in a machine', async (t) => {
  // Given a cartridge inserted in one machine.
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
  const secondMachine = await commissionMachine(umi, {
    machineCollection,
    name: 'Second Machine',
  });

  // When its owner inserts it into a second machine.
  const promise = insertCartridgeV2(umi, {
    cartridge,
    game: game.game,
    owner: umi.identity,
    machine: secondMachine,
    machineCollection,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);

  // Then it fails and the first link stands.
  await t.throwsAsync(promise, { name: 'CartridgeAlreadyInserted' });
  t.deepEqual(
    await linkBytes(umi, cartridge),
    Array.from(publicKeyBytes(machine))
  );
});

test('it fails when the signer does not own the cartridge', async (t) => {
  const { umi, game, machineCollection, machine } = await setup();
  const someoneElse = generateSigner(umi).publicKey;
  const theirCartridge = (await printCartridge(umi, game, someoneElse))
    .publicKey;

  const promise = insertCartridgeV2(umi, {
    cartridge: theirCartridge,
    game: game.game,
    owner: umi.identity,
    machine,
    machineCollection,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { name: 'NotCartridgeOwner' });
});

test('it fails when the signer does not own the machine', async (t) => {
  const { umi, game, cartridge, machineCollection } = await setup();
  const theirMachine = await commissionMachine(umi, {
    machineCollection,
    name: 'Their Machine',
    owner: generateSigner(umi).publicKey,
  });

  const promise = insertCartridgeV2(umi, {
    cartridge,
    game: game.game,
    owner: umi.identity,
    machine: theirMachine,
    machineCollection,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { name: 'NotMachineOwner' });
});

test('it fails when the machine account is not a machine', async (t) => {
  // Given a second cartridge passed where the machine belongs.
  const { umi, game, cartridge, machineCollection } = await setup();
  const notAMachine = (await printCartridge(umi, game, umi.identity.publicKey))
    .publicKey;

  const promise = insertCartridgeV2(umi, {
    cartridge,
    game: game.game,
    owner: umi.identity,
    machine: notAMachine,
    machineCollection,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { name: 'InvalidMachine' });
});

test('it removes a cartridge, which frees it for another machine', async (t) => {
  // Given an inserted cartridge.
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

  // When its owner removes it.
  await removeCartridgeV2(umi, {
    cartridge,
    game: game.game,
    cartridgeOwner: umi.identity,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);

  // Then the link slot is empty.
  t.deepEqual(await linkBytes(umi, cartridge), []);

  // And it can go into another machine.
  const secondMachine = await commissionMachine(umi, {
    machineCollection,
    name: 'Second Machine',
  });
  await insertCartridgeV2(umi, {
    cartridge,
    game: game.game,
    owner: umi.identity,
    machine: secondMachine,
    machineCollection,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);
  t.deepEqual(
    await linkBytes(umi, cartridge),
    Array.from(publicKeyBytes(secondMachine))
  );
});

test('it fails to remove a cartridge that is not inserted', async (t) => {
  const { umi, game, cartridge } = await setup();

  const promise = removeCartridgeV2(umi, {
    cartridge,
    game: game.game,
    cartridgeOwner: umi.identity,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { name: 'CartridgeNotInserted' });
});

test('it fails to remove when the signer does not own the cartridge', async (t) => {
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

  const promise = removeCartridgeV2(umi, {
    cartridge,
    game: game.game,
    cartridgeOwner: generateSigner(umi),
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { name: 'NotCartridgeOwner' });
});

test('insertCartridgeV1 is retired', async (t) => {
  const { umi, game, cartridge, machineCollection, machine } = await setup();

  const promise = insertCartridgeV1(umi, {
    cartridge,
    game: game.game,
    cartridgeOwner: umi.identity,
    machine,
    machineCollection,
    machineOwner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { name: 'InstructionRetired' });
});

test('removeCartridgeV1 is retired', async (t) => {
  const { umi, game, cartridge, machineCollection, machine } = await setup();

  const promise = removeCartridgeV1(umi, {
    cartridge,
    game: game.game,
    cartridgeOwner: umi.identity,
    machine,
    machineCollection,
    machineOwner: umi.identity.publicKey,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { name: 'InstructionRetired' });
});

// ---- Negative tests: rules that rest on Core or a CPI, not an explicit check ----

/** A pubkey passed where a Signer is expected: the account is not a signer. */
const PROGRAM_ID = 'CART9hmcuf38a58NCYhRJmtGXJjh16eXmLr9hmhAqPZo';

const asNonSigner = (key: PublicKey) => key as unknown as Signer;

test('insert and remove fail with another game collection', async (t) => {
  // Given a cartridge of game A, inserted, and a second game B.
  const { umi, game, cartridge, machineCollection, machine } = await setup();
  const gameB = await releaseFreeGame(umi);

  // When game B's collection (and bump) is passed for an insert.
  const insert = insertCartridgeV2(umi, {
    cartridge,
    game: gameB.game,
    owner: umi.identity,
    machine,
    machineCollection,
    collectionNonce: 0,
    collectionBump: gameB.gameBump,
  }).sendAndConfirm(umi);

  // Then Core refuses with InvalidCollection: the cartridge is not in it.
  t.true(
    (await rejectionLogs(insert)).includes(coreFailed(CORE_INVALID_COLLECTION))
  );
  t.is(await linkBytes(umi, cartridge), undefined);

  // And the same for a remove of an inserted cartridge.
  await insertCartridgeV2(umi, {
    cartridge,
    game: game.game,
    owner: umi.identity,
    machine,
    machineCollection,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);
  const remove = removeCartridgeV2(umi, {
    cartridge,
    game: gameB.game,
    cartridgeOwner: umi.identity,
    collectionNonce: 0,
    collectionBump: gameB.gameBump,
  }).sendAndConfirm(umi);
  t.true(
    (await rejectionLogs(remove)).includes(coreFailed(CORE_INVALID_COLLECTION))
  );
  t.deepEqual(
    await linkBytes(umi, cartridge),
    Array.from(publicKeyBytes(machine))
  );
});

/** The runtime rejects a PDA signer whose seeds do not derive the address. */
const WRONG_BUMP = `Program ${PROGRAM_ID} failed: Could not create program address with signer seeds: Provided seeds do not result in a valid address`;

test('insert and remove fail with the right game but a wrong bump', async (t) => {
  const { umi, game, cartridge, machineCollection, machine } = await setup();
  const wrongBump = (game.gameBump + 1) % 256;

  const insert = insertCartridgeV2(umi, {
    cartridge,
    game: game.game,
    owner: umi.identity,
    machine,
    machineCollection,
    collectionNonce: 0,
    collectionBump: wrongBump,
  }).sendAndConfirm(umi);
  t.true((await rejectionLogs(insert)).includes(WRONG_BUMP));
  t.is(await linkBytes(umi, cartridge), undefined);

  await insertCartridgeV2(umi, {
    cartridge,
    game: game.game,
    owner: umi.identity,
    machine,
    machineCollection,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);
  const remove = removeCartridgeV2(umi, {
    cartridge,
    game: game.game,
    cartridgeOwner: umi.identity,
    collectionNonce: 0,
    collectionBump: wrongBump,
  }).sendAndConfirm(umi);
  t.true((await rejectionLogs(remove)).includes(WRONG_BUMP));
  t.deepEqual(
    await linkBytes(umi, cartridge),
    Array.from(publicKeyBytes(machine))
  );
});

test('insert fails when the machine collection is not the machine own collection', async (t) => {
  const { umi, game, cartridge, machine } = await setup();
  const otherCollection = await createMachineCollection(umi);

  const promise = insertCartridgeV2(umi, {
    cartridge,
    game: game.game,
    owner: umi.identity,
    machine,
    machineCollection: otherCollection,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);

  // load_machine checks the asset's update authority before the PDA.
  await t.throwsAsync(promise, { name: 'InvalidMachine' });
  t.is(await linkBytes(umi, cartridge), undefined);
});

test('insert fails when the machine is not a Core account', async (t) => {
  const { umi, game, cartridge, machineCollection } = await setup();

  const promise = insertCartridgeV2(umi, {
    cartridge,
    game: game.game,
    owner: umi.identity,
    machine: generateSigner(umi).publicKey,
    machineCollection,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { name: 'InvalidMachine' });
  t.is(await linkBytes(umi, cartridge), undefined);
});

test('insert fails when the owner does not sign', async (t) => {
  // Given a cartridge and a machine both owned by someone who is not the payer.
  const umi = await createUmi();
  const game = await releaseFreeGame(umi);
  const owner = generateSigner(umi).publicKey;
  const cartridge = (await printCartridge(umi, game, owner)).publicKey;
  const machineCollection = await createMachineCollection(umi);
  const machine = await commissionMachine(umi, { machineCollection, owner });

  // When the owner is named but does not sign.
  const promise = insertCartridgeV2(umi, {
    cartridge,
    game: game.game,
    owner: asNonSigner(owner),
    machine,
    machineCollection,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);

  // Then it fails and nothing is written.
  await t.throwsAsync(promise, { name: 'CartridgeOwnerMustSign' });
  t.is(await linkBytes(umi, cartridge), undefined);
});
