/* eslint-disable import/no-extraneous-dependencies */
import { createUmi as basecreateUmi } from '@metaplex-foundation/umi-bundle-tests';
import {
  createAssociatedToken,
  mplToolbox,
} from '@metaplex-foundation/mpl-toolbox';
import { bglCartridge, PAYMENT_TOKEN_MINT } from '../src';

export const createUmi = async () => {
  const umi = (await basecreateUmi()).use(mplToolbox()).use(bglCartridge());

  // Create a CRUMBS token account for the identity.
  await createAssociatedToken(umi, {
    mint: PAYMENT_TOKEN_MINT,
    owner: umi.identity.publicKey,
  }).sendAndConfirm(umi);
  return umi;
};
