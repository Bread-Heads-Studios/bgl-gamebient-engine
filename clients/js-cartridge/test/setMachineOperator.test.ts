import { defaultPublicKey, generateSigner } from '@metaplex-foundation/umi';
import test from 'ava';
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

  await t.throwsAsync(promise, { name: 'InvalidMachinePdaDerivation' });
});
