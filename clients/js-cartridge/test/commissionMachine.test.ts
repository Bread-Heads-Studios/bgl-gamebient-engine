import { generateSigner, publicKey } from '@metaplex-foundation/umi';
import test from 'ava';
import {
  AssetV1,
  createCollection,
  ExternalPluginAdapterSchema,
  fetchAsset,
  Key as MplCoreKey,
} from '@metaplex-foundation/mpl-core';
import {
  string,
  publicKey as publicKeySerializer,
} from '@metaplex-foundation/umi/serializers';
import { BGL_CARTRIDGE_PROGRAM_ID, commissionMachineV1 } from '../src';
import { createUmi } from './_setup';

test('it can create a new machine', async (t) => {
  // Given a Umi instance and a new signer.
  const umi = await createUmi();
  const machineCollection = generateSigner(umi);
  const machine = umi.eddsa.findPda(BGL_CARTRIDGE_PROGRAM_ID, [
    string({ size: 'variable' }).serialize('machine'),
    publicKeySerializer().serialize(machineCollection.publicKey),
    string({ size: 'variable' }).serialize('Test Machine'),
  ]);

  await createCollection(umi, {
    collection: machineCollection,
    name: 'Machine Collection',
    uri: 'https://machine-collection.com',
  }).sendAndConfirm(umi);

  // When we create a new machine.
  await commissionMachineV1(umi, {
    name: 'Test Machine',
    uri: 'https://test-machine.com',
    machine,
    machineCollection: machineCollection.publicKey,
    owner: umi.identity.publicKey,
  }).sendAndConfirm(umi);

  // Then an account was created with the correct data.
  t.like(await fetchAsset(umi, publicKey(machine)), <AssetV1>{
    key: MplCoreKey.AssetV1,
    name: 'Test Machine',
    uri: 'https://test-machine.com',
    owner: umi.identity.publicKey,
    updateAuthority: {
      type: 'Collection',
      address: machineCollection.publicKey,
    },
    freezeDelegate: { frozen: false },
    appDatas: [
      {
        authority: { type: 'UpdateAuthority', address: undefined },
        dataAuthority: { type: 'Address', address: publicKey(machine) },
        lifecycleChecks: undefined,
        offset: 122n,
        schema: ExternalPluginAdapterSchema.Binary,
        type: 'AppData',
      },
    ],
  });
});
