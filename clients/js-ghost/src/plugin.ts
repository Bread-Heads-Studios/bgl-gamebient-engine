import { UmiPlugin } from '@metaplex-foundation/umi';
import { createBglGhostProgram } from './generated';

export const bglGhost = (): UmiPlugin => ({
  install(umi) {
    umi.programs.add(createBglGhostProgram(), false);
  },
});
