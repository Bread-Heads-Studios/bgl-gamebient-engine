import {
  defaultPublicKey,
  generateSigner,
  PublicKey,
  Signer,
} from '@metaplex-foundation/umi';
import test from 'ava';
import {
  create,
  fetchCollection,
  transferV1,
} from '@metaplex-foundation/mpl-core';
import {
  commissionMachineV1,
  findMachinePda,
  setMachineOperatorV1,
} from '../src';
import {
  commissionMachine,
  createMachineCollection,
  createUmi,
  fetchMachineData,
  MACHINE_URI,
} from './_setup';

test('the owner can set a new operator', async (t) => {
  // Given a machine with a first operator.
  const umi = await createUmi();
  const machineCollection = await createMachineCollection(umi);
  const machine = await commissionMachine(umi, {
    machineCollection,
    operator: generateSigner(umi).publicKey,
  });
  const second = generateSigner(umi).publicKey;

  // When the owner sets a second operator.
  await setMachineOperatorV1(umi, {
    machine,
    machineCollection,
    owner: umi.identity,
    operator: second,
  }).sendAndConfirm(umi);

  // Then the machine holds the second operator.
  t.deepEqual(await fetchMachineData(umi, machine), {
    version: 1,
    operator: second,
  });
});

test('the owner can revoke the operator with the all-zero key', async (t) => {
  const umi = await createUmi();
  const machineCollection = await createMachineCollection(umi);
  const machine = await commissionMachine(umi, {
    machineCollection,
    operator: generateSigner(umi).publicKey,
  });

  await setMachineOperatorV1(umi, {
    machine,
    machineCollection,
    owner: umi.identity,
    operator: defaultPublicKey(),
  }).sendAndConfirm(umi);

  t.deepEqual(await fetchMachineData(umi, machine), {
    version: 1,
    operator: defaultPublicKey(),
  });
});

test('it sets an operator on a machine commissioned with V1', async (t) => {
  // Given a V1 machine, which has no MachineData.
  const umi = await createUmi();
  const machineCollection = await createMachineCollection(umi);
  await commissionMachineV1(umi, {
    name: 'Test Machine',
    uri: MACHINE_URI,
    machineCollection,
    owner: umi.identity.publicKey,
  }).sendAndConfirm(umi);
  const [machine] = findMachinePda(umi, {
    machineCollection,
    name: 'Test Machine',
  });
  t.is(await fetchMachineData(umi, machine), null);
  const operator = generateSigner(umi).publicKey;

  // When the owner sets an operator.
  await setMachineOperatorV1(umi, {
    machine,
    machineCollection,
    owner: umi.identity,
    operator,
  }).sendAndConfirm(umi);

  // Then the machine holds it.
  t.deepEqual(await fetchMachineData(umi, machine), { version: 1, operator });
});

test('it fails when the signer does not own the machine', async (t) => {
  const umi = await createUmi();
  const machineCollection = await createMachineCollection(umi);
  const machine = await commissionMachine(umi, { machineCollection });
  const stranger = generateSigner(umi);

  const promise = setMachineOperatorV1(umi, {
    machine,
    machineCollection,
    owner: stranger,
    operator: stranger.publicKey,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { name: 'NotMachineOwner' });
});

test('it fails for the wrong machine collection', async (t) => {
  const umi = await createUmi();
  const machineCollection = await createMachineCollection(umi);
  const otherCollection = await createMachineCollection(umi);
  const machine = await commissionMachine(umi, { machineCollection });

  const promise = setMachineOperatorV1(umi, {
    machine,
    machineCollection: otherCollection,
    owner: umi.identity,
    operator: generateSigner(umi).publicKey,
  }).sendAndConfirm(umi);

  // load_machine checks the asset's update authority before the PDA.
  await t.throwsAsync(promise, { name: 'InvalidMachine' });
});

test('after a transfer only the new owner can set the operator', async (t) => {
  // Given a machine with an operator, transferred to a new owner.
  const umi = await createUmi();
  const machineCollection = await createMachineCollection(umi);
  const first = generateSigner(umi).publicKey;
  const machine = await commissionMachine(umi, {
    machineCollection,
    operator: first,
  });
  const newOwner = generateSigner(umi);
  await transferV1(umi, {
    asset: machine,
    collection: machineCollection,
    newOwner: newOwner.publicKey,
  }).sendAndConfirm(umi);

  // When the previous owner tries to replace the operator.
  const attacker = generateSigner(umi).publicKey;
  const promise = setMachineOperatorV1(umi, {
    machine,
    machineCollection,
    owner: umi.identity,
    operator: attacker,
  }).sendAndConfirm(umi);

  // Then it fails and the operator is unchanged.
  await t.throwsAsync(promise, { name: 'NotMachineOwner' });
  t.deepEqual(await fetchMachineData(umi, machine), {
    version: 1,
    operator: first,
  });

  // And the new owner can.
  const second = generateSigner(umi).publicKey;
  await setMachineOperatorV1(umi, {
    machine,
    machineCollection,
    owner: newOwner,
    operator: second,
  }).sendAndConfirm(umi);
  t.deepEqual(await fetchMachineData(umi, machine), {
    version: 1,
    operator: second,
  });
});

test('it fails for a Core asset in the collection that is not at the machine PDA', async (t) => {
  // Given an asset in the machine collection at some other address.
  const umi = await createUmi();
  const machineCollection = await createMachineCollection(umi);
  const impostor = generateSigner(umi);
  await create(umi, {
    asset: impostor,
    name: 'Impostor',
    uri: MACHINE_URI,
    collection: await fetchCollection(umi, machineCollection),
    owner: umi.identity.publicKey,
  }).sendAndConfirm(umi);

  const promise = setMachineOperatorV1(umi, {
    machine: impostor.publicKey,
    machineCollection,
    owner: umi.identity,
    operator: generateSigner(umi).publicKey,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { name: 'InvalidMachinePdaDerivation' });
});

test('it fails when the machine is not a Core account', async (t) => {
  const umi = await createUmi();
  const machineCollection = await createMachineCollection(umi);

  const promise = setMachineOperatorV1(umi, {
    machine: generateSigner(umi).publicKey,
    machineCollection,
    owner: umi.identity,
    operator: generateSigner(umi).publicKey,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { name: 'InvalidMachine' });
});

test('it fails when the owner does not sign', async (t) => {
  // Given a machine owned by someone other than the payer.
  const umi = await createUmi();
  const machineCollection = await createMachineCollection(umi);
  const owner: PublicKey = generateSigner(umi).publicKey;
  const first = generateSigner(umi).publicKey;
  const machine = await commissionMachine(umi, {
    machineCollection,
    owner,
    operator: first,
  });

  // When the owner is named but does not sign.
  const promise = setMachineOperatorV1(umi, {
    machine,
    machineCollection,
    owner: owner as unknown as Signer,
    operator: generateSigner(umi).publicKey,
  }).sendAndConfirm(umi);

  // Then it fails and the operator is unchanged.
  await t.throwsAsync(promise, { name: 'MachineOwnerMustSign' });
  t.deepEqual(await fetchMachineData(umi, machine), {
    version: 1,
    operator: first,
  });
});
