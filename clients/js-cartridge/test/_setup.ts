/* eslint-disable import/no-extraneous-dependencies */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createUmi as basecreateUmi } from '@metaplex-foundation/umi-bundle-tests';
import {
  createAssociatedToken,
  createMint,
  findAssociatedTokenPda,
  mintTokensTo,
  mplToolbox,
} from '@metaplex-foundation/mpl-toolbox';
import {
  createSignerFromKeypair,
  Pda,
  PublicKey,
  Signer,
  Umi,
} from '@metaplex-foundation/umi';
import { bglCartridge, LOCALNET_USDC_MINT, PAYMENT_TOKEN_MINT } from '../src';

export const createUmi = async () => {
  const umi = (await basecreateUmi()).use(mplToolbox()).use(bglCartridge());

  // Create a CRUMBS token account for the identity.
  await createAssociatedToken(umi, {
    mint: PAYMENT_TOKEN_MINT,
    owner: umi.identity.publicKey,
  }).sendAndConfirm(umi);
  return umi;
};

/**
 * The localnet USDC stand-in's keypair (`test/fixtures/usdc-mint.json`). The
 * program accepts this mint in place of USDC while the cluster is in epoch
 * zero. The mint is its own mint authority so every test can mint with it.
 */
export const loadLocalnetUsdcMint = (umi: Umi): Signer => {
  // ava compiles tests to dist/test/, so the fixture is two levels up.
  const path = join(
    __dirname,
    '..',
    '..',
    'test',
    'fixtures',
    'usdc-mint.json'
  );
  const secret = new Uint8Array(JSON.parse(readFileSync(path, 'utf-8')));
  const keypair = umi.eddsa.createKeypairFromSecretKey(secret);
  const signer = createSignerFromKeypair(umi, keypair);
  if (signer.publicKey !== LOCALNET_USDC_MINT) {
    throw new Error('usdc-mint.json does not match LOCALNET_USDC_MINT');
  }
  return signer;
};

/** Creates the localnet USDC mint if this validator does not have it yet. */
export const ensureLocalnetUsdcMint = async (umi: Umi): Promise<Signer> => {
  const mint = loadLocalnetUsdcMint(umi);
  if (!(await umi.rpc.accountExists(mint.publicKey))) {
    await createMint(umi, {
      mint,
      decimals: 6,
      mintAuthority: mint.publicKey,
    }).sendAndConfirm(umi);
  }
  return mint;
};

/** Gives `owner` `amount` localnet USDC base units, creating their token account if needed. */
export const fundUsdc = async (
  umi: Umi,
  owner: PublicKey,
  amount: number | bigint
): Promise<Pda> => {
  const mint = await ensureLocalnetUsdcMint(umi);
  const token = findAssociatedTokenPda(umi, { mint: mint.publicKey, owner });
  if (!(await umi.rpc.accountExists(token[0]))) {
    await createAssociatedToken(umi, {
      mint: mint.publicKey,
      owner,
    }).sendAndConfirm(umi);
  }
  await mintTokensTo(umi, {
    mint: mint.publicKey,
    token,
    mintAuthority: mint,
    amount,
  }).sendAndConfirm(umi);
  return token;
};
