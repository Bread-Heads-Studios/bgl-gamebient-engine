/* eslint-disable import/no-extraneous-dependencies */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createUmi as basecreateUmi } from '@metaplex-foundation/umi-bundle-tests';
import {
  createAssociatedToken,
  createIdempotentAssociatedToken,
  findAssociatedTokenPda,
  mintTokensTo,
  mplToolbox,
} from '@metaplex-foundation/mpl-toolbox';
import {
  createSignerFromKeypair,
  PublicKey,
  Signer,
  Umi,
} from '@metaplex-foundation/umi';
import { bglCartridge, CRUMBS_MINT, USDC_MINT } from '../src';

export const createUmi = async () => {
  const umi = (await basecreateUmi()).use(mplToolbox()).use(bglCartridge());

  // Create a CRUMBS token account for the identity.
  await createAssociatedToken(umi, {
    mint: CRUMBS_MINT,
    owner: umi.identity.publicKey,
  }).sendAndConfirm(umi);
  return umi;
};

/** The localnet authority: AML source authority and the local USDC mint authority. */
export const loadLocalnetAuthority = (umi: Umi): Signer => {
  // ava runs the compiled tests from dist/test/; fixtures stay in test/fixtures/.
  const path = join(
    __dirname,
    '..',
    '..',
    'test',
    'fixtures',
    'source-authority.json'
  );
  const secret = new Uint8Array(JSON.parse(readFileSync(path, 'utf-8')));
  return createSignerFromKeypair(
    umi,
    umi.eddsa.createKeypairFromSecretKey(secret)
  );
};

/** Creates `owner`'s USDC token account if needed and mints `amount` base units into it. */
export const fundUsdc = async (umi: Umi, owner: PublicKey, amount: bigint) => {
  const [token] = findAssociatedTokenPda(umi, { mint: USDC_MINT, owner });
  await createIdempotentAssociatedToken(umi, {
    mint: USDC_MINT,
    owner,
    ata: token,
  })
    .add(
      mintTokensTo(umi, {
        mint: USDC_MINT,
        token,
        amount,
        mintAuthority: loadLocalnetAuthority(umi),
      })
    )
    .sendAndConfirm(umi);
};
