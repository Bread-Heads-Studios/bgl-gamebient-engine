/* eslint-disable import/no-extraneous-dependencies */
import {
  createNoopSigner,
  generateSigner,
  sol,
} from '@metaplex-foundation/umi';
import { transferSol } from '@metaplex-foundation/mpl-toolbox';
import test from 'ava';
import {
  burnV1,
  create,
  execute,
  fetchAsset,
  findAssetSignerPda,
  transfer,
  transferV1,
} from '@metaplex-foundation/mpl-core';
import { createUmi } from './_setup';

// Pins the mpl-core behaviour the crown design depends on: a permanently
// frozen asset can still be moved by its permanent transfer delegate, can't be
// transferred or burned by its owner, and its owner can still `Execute`.
test('frozen asset: permanent transfer works, owner transfer/burn blocked, owner execute works', async (t) => {
  const umi = await createUmi();
  const delegate = generateSigner(umi);
  const owner = generateSigner(umi);
  const nextOwner = generateSigner(umi);
  const asset = generateSigner(umi);
  await umi.rpc.airdrop(owner.publicKey, sol(1));
  await umi.rpc.airdrop(delegate.publicKey, sol(1));

  await create(umi, {
    asset,
    name: 'Crown',
    uri: 'https://example.com',
    owner: owner.publicKey,
    plugins: [
      {
        type: 'PermanentFreezeDelegate',
        frozen: true,
        authority: { type: 'Address', address: delegate.publicKey },
      },
      {
        type: 'PermanentTransferDelegate',
        authority: { type: 'Address', address: delegate.publicKey },
      },
    ],
  }).sendAndConfirm(umi);

  const assetSigner = findAssetSignerPda(umi, { asset: asset.publicKey });
  await umi.rpc.airdrop(assetSigner[0], sol(1));

  // Owner cannot transfer.
  const ownerTransfer = await transferV1(umi, {
    asset: asset.publicKey,
    newOwner: nextOwner.publicKey,
    authority: owner,
  })
    .sendAndConfirm(umi)
    .then(() => 'ok')
    .catch(() => 'rejected');

  // Owner cannot burn.
  const ownerBurn = await burnV1(umi, {
    asset: asset.publicKey,
    authority: owner,
  })
    .sendAndConfirm(umi)
    .then(() => 'ok')
    .catch(() => 'rejected');

  // Owner can execute out of the asset signer.
  const ownerExecute = await execute(umi, {
    asset: await fetchAsset(umi, asset.publicKey),
    authority: owner,
    instructions: transferSol(umi, {
      source: createNoopSigner(assetSigner[0]),
      destination: owner.publicKey,
      amount: sol(0.5),
    }),
  })
    .sendAndConfirm(umi)
    .then(() => 'ok')
    .catch((e) => `rejected: ${e.message}`);

  // Delegate can transfer.
  const delegateTransfer = await transfer(umi, {
    asset: await fetchAsset(umi, asset.publicKey),
    newOwner: nextOwner.publicKey,
    authority: delegate,
  })
    .sendAndConfirm(umi)
    .then(() => 'ok')
    .catch((e) => `rejected: ${e.message}`);

  const after = await fetchAsset(umi, asset.publicKey);
  t.is(ownerTransfer, 'rejected');
  t.is(ownerBurn, 'rejected');
  t.is(delegateTransfer, 'ok');
  t.is(after.owner, nextOwner.publicKey);
  t.is(ownerExecute, 'ok');
  t.true(after.permanentFreezeDelegate?.frozen);
});
