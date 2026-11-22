import {
  AssetV1,
  CollectionV1,
  fetchAsset,
  fetchCollection,
  findAssetSignerPda,
} from '@metaplex-foundation/mpl-core';
import {
  createIdempotentAssociatedToken,
  findAssociatedTokenPda,
} from '@metaplex-foundation/mpl-toolbox';
import {
  Context,
  Pda,
  PublicKey,
  Signer,
  TransactionBuilder,
  transactionBuilder,
} from '@metaplex-foundation/umi';
import {
  publicKey as publicKeySerializer,
  string,
} from '@metaplex-foundation/umi/serializers';
import {
  BGL_CARTRIDGE_PROGRAM_ID,
  LookData,
  PriceType,
  getLookDataSerializer,
} from '../generated';

/**
 * The asset signer PDA of a Core asset: the owner of a cartridge's look
 * copies. Re-exported from mpl-core so the derivation cannot drift.
 */
export { findAssetSignerPda };

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
 * Setup to send before `printLookV1` for this look: for a Transfer look whose
 * creator has no ATA for the payment mint, it creates one (the print refuses a
 * missing creator token account). Empty for a Burn look or an existing ATA.
 * `payer` pays the ATA rent. Prepend it:
 * `(await prepareLookPayment(...)).add(printLookV1(...))`.
 *
 * The existence check is needed because the local test validator's
 * associated token program treats the idempotent create as a plain create
 * and fails on an existing account (IllegalOwner). The idempotent create is
 * kept so a race with another creator of the same ATA still succeeds.
 */
export async function prepareLookPayment(
  context: Pick<Context, 'eddsa' | 'programs' | 'payer' | 'rpc'>,
  input: { payer: Signer; data: LookData }
): Promise<TransactionBuilder> {
  const builder = transactionBuilder();
  if (input.data.priceType !== PriceType.Transfer) return builder;
  const mint = input.data.paymentMint;
  const owner = input.data.creator;
  const [ata] = findAssociatedTokenPda(context, { mint, owner });
  if (await context.rpc.accountExists(ata)) return builder;
  return builder.add(
    createIdempotentAssociatedToken(context, {
      payer: input.payer,
      ata,
      owner,
      mint,
    })
  );
}

/** The bytes of a collection's LinkedAppData section held by its update authority. */
function lookDataBytes(collection: CollectionV1): Uint8Array | undefined {
  const section = collection.dataSections?.find(
    (d) =>
      d.parentKey.type === 'LinkedAppData' &&
      d.parentKey.dataAuthority.type === 'UpdateAuthority'
  );
  return section?.data instanceof Uint8Array ? section.data : undefined;
}

/**
 * True only for a look the program registered for `game` by `creator`: the
 * collection's LinkedAppData decodes as `LookData` for that game and creator,
 * and the collection sits at the look PDA `["look", game, creator, lookId]`.
 *
 * Pass the `creator` from the catalog, never from the collection: anyone can
 * register the same look id for a game under their own creator key, so a
 * creator read from the checked collection proves nothing.
 */
export function isOfficialLook(
  context: Pick<Context, 'eddsa' | 'programs'>,
  input: {
    collection: CollectionV1;
    game: PublicKey;
    creator: PublicKey;
    lookId: string;
  }
): boolean {
  const bytes = lookDataBytes(input.collection);
  if (!bytes) return false;
  let data: LookData;
  try {
    data = readLookData(bytes);
  } catch {
    return false;
  }
  if (data.game !== input.game || data.creator !== input.creator) return false;
  const [expected] = findLookPda(context, {
    game: input.game,
    creator: input.creator,
    lookId: input.lookId,
  });
  return input.collection.publicKey === expected;
}

/**
 * True only if `asset` is a copy of the official look `(game, creator,
 * lookId)` held by `cartridge`: the copy belongs to the look collection at
 * the look PDA, that collection passes `isOfficialLook`, the copy is owned by
 * the cartridge's asset signer, and the cartridge is a Core asset of `game`.
 * Fetches the copy, the look collection and the cartridge over RPC.
 *
 * The website must use this to decide whether a cartridge holds a look, not
 * `isOfficialLook` alone, which says nothing about who holds a copy. Read the
 * look's URI and `LookData` from the collection, not from the copy: copies
 * keep the URI they were printed with, while the collection follows the
 * latest version.
 */
export async function isLookCopyFor(
  context: Context,
  input: {
    asset: PublicKey;
    cartridge: PublicKey;
    game: PublicKey;
    creator: PublicKey;
    lookId: string;
  }
): Promise<boolean> {
  const [look] = findLookPda(context, {
    game: input.game,
    creator: input.creator,
    lookId: input.lookId,
  });
  let copy: AssetV1;
  let collection: CollectionV1;
  let cartridge: AssetV1;
  try {
    copy = await fetchAsset(context, input.asset, { skipDerivePlugins: true });
    if (
      copy.updateAuthority.type !== 'Collection' ||
      copy.updateAuthority.address !== look
    ) {
      return false;
    }
    collection = await fetchCollection(context, look);
    cartridge = await fetchAsset(context, input.cartridge, {
      skipDerivePlugins: true,
    });
  } catch {
    return false;
  }
  if (
    !isOfficialLook(context, {
      collection,
      game: input.game,
      creator: input.creator,
      lookId: input.lookId,
    })
  ) {
    return false;
  }
  const [signer] = findAssetSignerPda(context, { asset: input.cartridge });
  if (copy.owner !== signer) return false;
  return (
    cartridge.updateAuthority.type === 'Collection' &&
    cartridge.updateAuthority.address === input.game
  );
}
