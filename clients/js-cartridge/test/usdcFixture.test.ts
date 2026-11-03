import test from 'ava';
import {
  fetchToken,
  findAssociatedTokenPda,
} from '@metaplex-foundation/mpl-toolbox';
import { USDC_MINT } from '../src';
import { createUmi, fundUsdc } from './_setup';

test('the local validator lets tests mint USDC', async (t) => {
  const umi = await createUmi();
  await fundUsdc(umi, umi.identity.publicKey, 5_000_000n);
  const [ata] = findAssociatedTokenPda(umi, {
    mint: USDC_MINT,
    owner: umi.identity.publicKey,
  });
  t.is((await fetchToken(umi, ata)).amount, 5_000_000n);
});
