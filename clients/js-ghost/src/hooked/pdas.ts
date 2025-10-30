import { Context, Pda } from '@metaplex-foundation/umi';
import { string } from '@metaplex-foundation/umi/serializers';
import { BGL_GHOST_PROGRAM_ID } from '../generated';

export function findGhostPda(
  context: Pick<Context, 'eddsa' | 'programs'>,
  seeds: {
    /** The name of the ghost */
    name: string;
  }
): Pda {
  const programId = context.programs.getPublicKey(
    'bglGhost',
    BGL_GHOST_PROGRAM_ID
  );
  return context.eddsa.findPda(programId, [
    string({ size: 'variable' }).serialize('ghost'),
    string({ size: 'variable' }).serialize(seeds.name),
  ]);
}
