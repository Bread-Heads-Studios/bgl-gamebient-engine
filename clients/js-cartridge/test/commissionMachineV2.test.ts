import {
  defaultPublicKey,
  generateSigner,
  sol,
} from '@metaplex-foundation/umi';
import test from 'ava';
import {
  AssetV1,
  fetchAsset,
  Key as MplCoreKey,
} from '@metaplex-foundation/mpl-core';
import { commissionMachineV2 } from '../src';
import {
  commissionMachine,
  coreFailed,
  CORE_NO_APPROVALS,
  createMachineCollection,
  createUmi,
  fetchMachineData,
  MACHINE_URI,
  rejectionLogs,
} from './_setup';

test('it commissions a machine with an operator, without the owner signing', async (t) => {
  // Given a machine collection, an owner that never signs and a device key.
  const umi = await createUmi();
  const machineCollection = await createMachineCollection(umi);
  const owner = generateSigner(umi).publicKey;
  const operator = generateSigner(umi).publicKey;

  // When the collection authority commissions the machine.
  const machine = await commissionMachine(umi, {
    machineCollection,
    owner,
    operator,
  });

  // Then the machine exists and belongs to the owner.
  t.like(await fetchAsset(umi, machine), <AssetV1>{
    key: MplCoreKey.AssetV1,
    name: 'Test Machine',
    uri: MACHINE_URI,
    owner,
    updateAuthority: { type: 'Collection', address: machineCollection },
    freezeDelegate: { frozen: false },
  });

  // And its MachineData holds the operator.
  t.deepEqual(await fetchMachineData(umi, machine), { version: 1, operator });
});

test('it accepts the all-zero operator', async (t) => {
  const umi = await createUmi();
  const machineCollection = await createMachineCollection(umi);

  const machine = await commissionMachine(umi, { machineCollection });

  t.deepEqual(await fetchMachineData(umi, machine), {
    version: 1,
    operator: defaultPublicKey(),
  });
});

test('it rejects an empty name', async (t) => {
  const umi = await createUmi();
  const machineCollection = await createMachineCollection(umi);

  const promise = commissionMachineV2(umi, {
    name: '',
    uri: MACHINE_URI,
    machineCollection,
    owner: umi.identity.publicKey,
    operator: defaultPublicKey(),
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { name: 'InvalidName' });
});

test('it rejects a payer that is not the collection authority', async (t) => {
  // Given a collection whose update authority is the identity.
  const umi = await createUmi();
  const machineCollection = await createMachineCollection(umi);
  const stranger = generateSigner(umi);
  await umi.rpc.airdrop(stranger.publicKey, sol(10));

  // When a stranger pays, with no authority account.
  const promise = commissionMachineV2(umi, {
    name: 'Test Machine',
    uri: MACHINE_URI,
    machineCollection,
    owner: stranger.publicKey,
    operator: defaultPublicKey(),
    payer: stranger,
  }).sendAndConfirm(umi);

  // Then mpl-core refuses to add the machine to the collection (NoApprovals).
  t.true(
    (await rejectionLogs(promise)).includes(coreFailed(CORE_NO_APPROVALS))
  );
});

test('it cannot re-commission a machine to change its operator', async (t) => {
  // Given a commissioned machine with an operator.
  const umi = await createUmi();
  const machineCollection = await createMachineCollection(umi);
  const operator = generateSigner(umi).publicKey;
  const machine = await commissionMachine(umi, { machineCollection, operator });

  // When the same (collection, name) is commissioned again with another operator.
  const promise = commissionMachineV2(umi, {
    name: 'Test Machine',
    uri: MACHINE_URI,
    machineCollection,
    owner: umi.identity.publicKey,
    operator: generateSigner(umi).publicKey,
  }).sendAndConfirm(umi);

  // Then it fails and the stored operator is unchanged.
  await t.throwsAsync(promise, { message: /already in use/ });
  t.deepEqual(await fetchMachineData(umi, machine), { version: 1, operator });
});
