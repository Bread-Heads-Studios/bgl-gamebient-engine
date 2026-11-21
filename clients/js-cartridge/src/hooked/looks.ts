import {
  CollectionV1,
  MPL_CORE_PROGRAM_ID,
} from '@metaplex-foundation/mpl-core';
import { findAssociatedTokenPda } from '@metaplex-foundation/mpl-toolbox';
import { Context, Pda, PublicKey } from '@metaplex-foundation/umi';
import {
  publicKey as publicKeySerializer,
  string,
} from '@metaplex-foundation/umi/serializers';
import {
  BGL_CARTRIDGE_PROGRAM_ID,
  LookData,
  getLookDataSerializer,
} from '../generated';

/** Serialized length of `LookData` v1. */
export const LOOK_DATA_V1_LEN = 147;

/**
 * The look collection PDA: seeds `["look", game, creator, look_id]`. The id is
 * the raw utf-8 bytes with no length prefix, as on chain.
 */
export function findLookPda(
  context: Pick<Context, 'eddsa' | 'programs'>,
  seeds: {
    /** The game the look is for */
    game: PublicKey;
    /** The look creator */
    creator: PublicKey;
    /** The look id, 1-32 characters of a-z, 0-9 or - */
    lookId: string;
  }
): Pda {
  const programId = context.programs.getPublicKey(
    'bglCartridge',
    BGL_CARTRIDGE_PROGRAM_ID
  );
  return context.eddsa.findPda(programId, [
    string({ size: 'variable' }).serialize('look'),
    publicKeySerializer().serialize(seeds.game),
    publicKeySerializer().serialize(seeds.creator),
    string({ size: 'variable' }).serialize(seeds.lookId),
  ]);
}

/** Decodes a look's LinkedAppData bytes (v1 only). */
export function readLookData(bytes: Uint8Array): LookData {
  if (bytes.length !== LOOK_DATA_V1_LEN) {
    throw new Error(`Unknown look data layout (${bytes.length} bytes)`);
  }
  if (bytes[0] !== 1) {
    throw new Error(`Invalid look data version (${bytes[0]})`);
  }
  return getLookDataSerializer().deserialize(bytes)[0];
}

/** The asset signer PDA of a Core asset: the owner of a cartridge's look copies. */
export function findAssetSignerPda(
  context: Pick<Context, 'eddsa'>,
  seeds: { asset: PublicKey }
): Pda {
  return context.eddsa.findPda(MPL_CORE_PROGRAM_ID, [
    string({ size: 'variable' }).serialize('mpl-core-execute'),
    publicKeySerializer().serialize(seeds.asset),
  ]);
}

/**
 * The payment accounts `printLookV1` needs for this look: the ATAs of the
 * look's creator and the payer for the look's payment mint. Spread the result
 * into the call.
 */
export function findLookPaymentAccounts(
  context: Pick<Context, 'eddsa' | 'programs'>,
  input: { payer: PublicKey; data: LookData }
): {
  paymentMint: PublicKey;
  creatorTokenAccount: PublicKey;
  payerTokenAccount: PublicKey;
} {
  const mint = input.data.paymentMint;
  const [creatorTokenAccount] = findAssociatedTokenPda(context, {
    mint,
    owner: input.data.creator,
  });
  const [payerTokenAccount] = findAssociatedTokenPda(context, {
    mint,
    owner: input.payer,
  });
  return { paymentMint: mint, creatorTokenAccount, payerTokenAccount };
}

/**
 * True only for a look the program registered for `game`: the collection's
 * LinkedAppData decodes as `LookData` for that game, and the collection sits
 * at the look PDA its creator and id imply. A look copy's collection is
 * checked with this before its asset is trusted as an official look.
 */
export function isOfficialLook(
  context: Pick<Context, 'eddsa' | 'programs'>,
  input: { collection: CollectionV1; lookId: string; game: PublicKey }
): boolean {
  const bytes = input.collection.dataSections?.[0]?.data;
  if (!bytes) return false;
  let data: LookData;
  try {
    data = readLookData(bytes);
  } catch {
    return false;
  }
  if (data.game !== input.game) return false;
  const [expected] = findLookPda(context, {
    game: input.game,
    creator: data.creator,
    lookId: input.lookId,
  });
  return input.collection.publicKey === expected;
}
