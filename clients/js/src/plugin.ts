import { UmiPlugin } from '@metaplex-foundation/umi';
import { createBglCartridgeProgram } from './generated';

export const bglCartridge = (): UmiPlugin => ({
  install(umi) {
    umi.programs.add(createBglCartridgeProgram(), false);
  },
});
