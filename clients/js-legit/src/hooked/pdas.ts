import { Context, Pda, PublicKey } from '@metaplex-foundation/umi';
import {
  publicKey as publicKeySerializer,
  string,
} from '@metaplex-foundation/umi/serializers';
import { BGL_LEGIT_PROGRAM_ID } from '../generated';

export function findPoolPda(
  context: Pick<Context, 'eddsa' | 'programs'>,
  seeds: {
    /** The authority of the pool */
    authority: PublicKey;
    /** The token mint for staking */
    mint: PublicKey;
  }
): Pda {
  const programId = context.programs.getPublicKey(
    'bglLegit',
    BGL_LEGIT_PROGRAM_ID
  );
  return context.eddsa.findPda(programId, [
    string({ size: 'variable' }).serialize('pool'),
    publicKeySerializer().serialize(seeds.authority),
    publicKeySerializer().serialize(seeds.mint),
  ]);
}

export function findStakeAccountPda(
  context: Pick<Context, 'eddsa' | 'programs'>,
  seeds: {
    /** The pool address */
    pool: PublicKey;
    /** The staker address */
    staker: PublicKey;
  }
): Pda {
  const programId = context.programs.getPublicKey(
    'bglLegit',
    BGL_LEGIT_PROGRAM_ID
  );

  return context.eddsa.findPda(programId, [
    string({ size: 'variable' }).serialize('stake'),
    publicKeySerializer().serialize(seeds.pool),
    publicKeySerializer().serialize(seeds.staker),
  ]);
}
