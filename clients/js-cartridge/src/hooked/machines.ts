import { AssetV1, fetchAsset } from '@metaplex-foundation/mpl-core';
import {
  Context,
  PublicKey,
  defaultPublicKey,
  publicKey,
} from '@metaplex-foundation/umi';
import { MachineData, getMachineDataSerializer } from '../generated';
import { ownedByCore } from './core';
import { findMachinePda } from './pdas';

/** Optional pin for a machine: it must sit in this machine collection. */
export type MachineExpectation = {
  /** The machine collection you trust. */
  machineCollection?: PublicKey;
};

/** Optional pins for a cartridge-in-machine check. */
export type InsertedExpectation = MachineExpectation & {
  /** The game collection the cartridge must belong to. */
  game?: PublicKey;
};

/** The collection in an asset's update authority, if it has one. */
function collectionOf(asset: AssetV1): PublicKey | null {
  return asset.updateAuthority.type === 'Collection'
    ? (asset.updateAuthority.address ?? null)
    : null;
}

/** Serialized length of `MachineData` v1. */
export const MACHINE_DATA_V1_LEN = 33;

/** Decodes a machine's AppData bytes (v1 only). */
export function readMachineData(bytes: Uint8Array): MachineData {
  if (bytes.length !== MACHINE_DATA_V1_LEN) {
    throw new Error(`Unknown machine data layout (${bytes.length} bytes)`);
  }
  if (bytes[0] !== 1) {
    throw new Error(`Invalid machine data version (${bytes[0]})`);
  }
  return getMachineDataSerializer().deserialize(bytes)[0];
}

/**
 * True if the account is a Core asset sitting at the machine PDA of its own
 * collection and name. That proves only internal consistency: anyone can
 * commission machines in a collection they control, so without `expect` the
 * machine may be in ANY collection. Pass `expect.machineCollection` with the
 * collection you trust to pin it.
 */
export function isMachine(
  context: Pick<Context, 'eddsa' | 'programs'>,
  machine: AssetV1,
  expect?: MachineExpectation
): boolean {
  if (!ownedByCore(context, machine)) return false;
  const machineCollection = collectionOf(machine);
  if (!machineCollection) return false;
  if (
    expect?.machineCollection &&
    expect.machineCollection !== machineCollection
  ) {
    return false;
  }
  try {
    const [expected] = findMachinePda(context, {
      machineCollection,
      name: machine.name,
    });
    return machine.publicKey === expected;
  } catch {
    // A name over 32 bytes cannot be a PDA seed, so it is not a machine.
    return false;
  }
}

/**
 * The operator recorded in a fetched asset's MachineData AppData, or null if
 * there is none: no `MachineData` yet, an unknown layout, the all-zero key
 * that revokes the operator, or (with `expect.machineCollection`) an asset in
 * another collection.
 *
 * This is a raw reader: it does NOT check that the asset is a machine. Use
 * `verifiedMachineOperator` or `fetchMachineOperator` for that.
 */
export function machineOperator(
  machine: AssetV1,
  expect?: MachineExpectation
): PublicKey | null {
  if (
    expect?.machineCollection &&
    expect.machineCollection !== collectionOf(machine)
  ) {
    return null;
  }
  const appData = machine.appDatas?.find(
    (a) =>
      a.dataAuthority.type === 'Address' &&
      a.dataAuthority.address === machine.publicKey
  );
  const bytes = appData?.data;
  if (!(bytes instanceof Uint8Array)) return null;
  try {
    const { operator } = readMachineData(bytes);
    return operator === defaultPublicKey() ? null : operator;
  } catch {
    return null;
  }
}

/**
 * `machineOperator`, but null unless `isMachine` accepts the asset (same
 * `expect`). Without `expect.machineCollection` a non-null result only proves
 * the asset is a machine PDA in SOME collection, so it must not by itself
 * decide who may operate a cabinet; pass the trusted machine collection.
 */
export function verifiedMachineOperator(
  context: Pick<Context, 'eddsa' | 'programs'>,
  machine: AssetV1,
  expect?: MachineExpectation
): PublicKey | null {
  return isMachine(context, machine, expect)
    ? machineOperator(machine, expect)
    : null;
}

/**
 * The address in a fetched cartridge's link slot, or null if the slot is
 * empty. A slot holding the cartridge's own key is empty too: the retired
 * `insertCartridgeV1` wrote that by mistake.
 *
 * This is only what the slot says. Use `isInserted` to decide whether the
 * cartridge may be played on a machine.
 */
export function insertedMachine(cartridge: AssetV1): PublicKey | null {
  const section = cartridge.dataSections?.find(
    (d) =>
      d.parentKey.type === 'LinkedAppData' &&
      d.parentKey.dataAuthority.type === 'UpdateAuthority'
  );
  const bytes = section?.data;
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) return null;
  const machine = publicKey(bytes);
  return machine === cartridge.publicKey ? null : machine;
}

/**
 * The decision behind `isInsertedIn`, on accounts already fetched with
 * mpl-core's `fetchAsset`: true only if both are Core accounts, `machine` is at
 * a machine PDA (see `isMachine`), the cartridge's link slot holds the
 * machine's address, and both have the same owner. A machine that is sold or
 * transferred stops carrying the previous owner's cartridges.
 *
 * Without `expect`, true only proves internal consistency: a machine PDA in
 * SOME collection, a link and one owner. Any wallet can build that with its
 * own collections, so it must not by itself gate a paid game. Pass `expect`
 * with the trusted machine collection and the game collection to pin both.
 */
export function isInserted(
  context: Pick<Context, 'eddsa' | 'programs'>,
  input: { cartridge: AssetV1; machine: AssetV1 },
  expect?: InsertedExpectation
): boolean {
  const { cartridge, machine } = input;
  if (!ownedByCore(context, cartridge)) return false;
  if (!isMachine(context, machine, expect)) return false;
  if (expect?.game && expect.game !== collectionOf(cartridge)) return false;
  if (insertedMachine(cartridge) !== machine.publicKey) return false;
  return cartridge.owner === machine.owner;
}

/**
 * The operator (the cabinet's device key) of the machine at `machine`, or
 * null if the account is missing, is not a Core asset at a machine PDA, has no
 * operator, or (with `expect.machineCollection`) is in another collection.
 *
 * Without `expect`, a non-null result only proves a machine PDA in SOME
 * collection, which anyone can create, so it must not by itself decide who may
 * operate a cabinet. Pass the trusted machine collection.
 */
export async function fetchMachineOperator(
  context: Context,
  machine: PublicKey,
  expect?: MachineExpectation
): Promise<PublicKey | null> {
  try {
    const asset = await fetchAsset(context, machine, {
      skipDerivePlugins: true,
    });
    return verifiedMachineOperator(context, asset, expect);
  } catch {
    return null;
  }
}

/**
 * The address in the link slot of the cartridge at `cartridge`, or null if
 * the account is missing, is not a Core asset, or its slot is empty.
 *
 * This is only what the slot says. Use `isInsertedIn` to decide whether the
 * cartridge may be played on a machine.
 */
export async function findInsertedMachine(
  context: Context,
  cartridge: PublicKey
): Promise<PublicKey | null> {
  try {
    const asset = await fetchAsset(context, cartridge, {
      skipDerivePlugins: true,
    });
    return ownedByCore(context, asset) ? insertedMachine(asset) : null;
  } catch {
    return null;
  }
}

/**
 * True if the cartridge at `cartridge` is linked to the machine at `machine`
 * and both have one owner (see `isInserted`). Fetches both over RPC; a missing
 * or undecodable account gives false.
 *
 * Without `expect`, true only proves internal consistency (a machine PDA in
 * SOME collection, a link, one owner), which any wallet can set up with its
 * own collections. It must not by itself gate a paid game: pass `expect` with
 * the trusted machine collection and the game collection to pin both.
 */
export async function isInsertedIn(
  context: Context,
  cartridge: PublicKey,
  machine: PublicKey,
  expect?: InsertedExpectation
): Promise<boolean> {
  try {
    const [cartridgeAsset, machineAsset] = await Promise.all([
      fetchAsset(context, cartridge, { skipDerivePlugins: true }),
      fetchAsset(context, machine, { skipDerivePlugins: true }),
    ]);
    return isInserted(
      context,
      { cartridge: cartridgeAsset, machine: machineAsset },
      expect
    );
  } catch {
    return false;
  }
}
