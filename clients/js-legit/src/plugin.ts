import { UmiPlugin } from '@metaplex-foundation/umi';
import { createBglLegitProgram } from './generated';

export const bglLegit = (): UmiPlugin => ({
  install(umi) {
    umi.programs.add(createBglLegitProgram(), false);
  },
});
