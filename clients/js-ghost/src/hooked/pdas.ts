import { Context, Pda, PublicKey } from '@metaplex-foundation/umi';
import {
  publicKey as publicKeySerializer,
  string,
  u32,
} from '@metaplex-foundation/umi/serializers';
import { BGL_GHOST_PROGRAM_ID } from '../generated';

export function findCrownPda(
  context: Pick<Context, 'eddsa' | 'programs'>,
  seeds: {
    /** The crown authority */
    authority: PublicKey;
    /** The game the crown belongs to */
    game: PublicKey;
    /** The season number */
    season: number;
  }
): Pda {
  const programId = context.programs.getPublicKey(
    'bglGhost',
    BGL_GHOST_PROGRAM_ID
  );
  return context.eddsa.findPda(programId, [
    string({ size: 'variable' }).serialize('crown'),
    publicKeySerializer().serialize(seeds.authority),
    publicKeySerializer().serialize(seeds.game),
    u32().serialize(seeds.season),
  ]);
}

export function findCrownAssetPda(
  context: Pick<Context, 'eddsa' | 'programs'>,
  seeds: {
    /** The crown PDA */
    crown: PublicKey;
  }
): Pda {
  const programId = context.programs.getPublicKey(
    'bglGhost',
    BGL_GHOST_PROGRAM_ID
  );
  return context.eddsa.findPda(programId, [
    string({ size: 'variable' }).serialize('crown_asset'),
    publicKeySerializer().serialize(seeds.crown),
  ]);
}
