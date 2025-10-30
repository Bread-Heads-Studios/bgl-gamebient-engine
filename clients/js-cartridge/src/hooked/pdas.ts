import { Context, Pda, PublicKey } from '@metaplex-foundation/umi';
import {
  publicKey as publicKeySerializer,
  string,
  u8,
} from '@metaplex-foundation/umi/serializers';
import { BGL_CARTRIDGE_PROGRAM_ID } from '../generated';

export function findMachinePda(
  context: Pick<Context, 'eddsa' | 'programs'>,
  seeds: {
    /** The address of the machine collection */
    machineCollection: PublicKey;
    /** The name of the machine */
    name: string;
  }
): Pda {
  const programId = context.programs.getPublicKey(
    'bglCartridge',
    BGL_CARTRIDGE_PROGRAM_ID
  );
  return context.eddsa.findPda(programId, [
    string({ size: 'variable' }).serialize('machine'),
    publicKeySerializer().serialize(seeds.machineCollection),
    string({ size: 'variable' }).serialize(seeds.name),
  ]);
}

export function findGamePda(
  context: Pick<Context, 'eddsa' | 'programs'>,
  seeds: {
    /** The name of the game */
    name: string;
    /** The nonce of the game */
    nonce: number;
  }
): Pda {
  const programId = context.programs.getPublicKey(
    'bglCartridge',
    BGL_CARTRIDGE_PROGRAM_ID
  );

  return context.eddsa.findPda(programId, [
    string({ size: 'variable' }).serialize('game'),
    string({ size: 'variable' }).serialize(seeds.name),
    u8().serialize(seeds.nonce),
  ]);
}
