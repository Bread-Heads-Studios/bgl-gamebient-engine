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

/** The pin every machine gate requires: the machine collection you trust. */
export type MachineExpectation = {
  /** The machine collection you trust. Required. */
  machineCollection: PublicKey;
};

/** The pins every cartridge-in-machine gate requires. */
export type InsertedExpectation = MachineExpectation & {
  /** The game collection the cartridge must belong to. Required. */
  game: PublicKey;
};

/** True for a non-empty string key; guards untyped JS callers. */
function present(key: unknown): key is PublicKey {
  return typeof key === 'string' && key.length > 0;
}

/**
 * Runtime guard for the gates: `expect` must be an object whose required keys
 * are all non-empty. Anything else is treated as "no pin", which fails closed.
 */
function pinned(expect: unknown, keys: string[]): boolean {
  if (typeof expect !== 'object' || expect === null) return false;
  const e = expect as Record<string, unknown>;
  return keys.every((k) => present(e[k]));
}

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
 * collection you trust to pin it. `expect` is optional here, but if it is
 * passed with a missing, null or empty `machineCollection` the answer is
 * false (a pin that is unset in the caller's config must not mean "no pin").
 */
export function isMachine(
  context: Pick<Context, 'eddsa' | 'programs'>,
  machine: AssetV1,
  expect?: MachineExpectation
): boolean {
  if (!ownedByCore(context, machine)) return false;
  const machineCollection = collectionOf(machine);
  if (!machineCollection) return false;
  if (expect !== undefined) {
    if (typeof expect !== 'object' || expect === null) return false;
    if ('machineCollection' in expect) {
      // Present-but-falsy (undefined, null, '') fails closed. A bare `{}`
      // carries no pin and behaves like omitting `expect`.
      if (
        !present(expect.machineCollection) ||
        expect.machineCollection !== machineCollection
      ) {
        return false;
      }
    }
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
 * RAW READER. The operator recorded in a fetched asset's MachineData AppData,
 * or null if there is none: no `MachineData` yet, an unknown layout, or the
 * all-zero key that revokes the operator.
 *
 * It checks NOTHING else: not that the asset is a machine, not that mpl-core
 * owns the account, not which collection it is in. Never use it to decide who
 * may operate a cabinet; use `verifiedMachineOperator` or
 * `fetchMachineOperator`, which require the trusted machine collection.
 */
export function machineOperator(machine: AssetV1): PublicKey | null {
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
 * GATE. The machine's operator, or null unless `isMachine` accepts the asset
 * pinned to `expect.machineCollection` (the machine collection you trust) and
 * the asset carries an operator. `expect` and its `machineCollection` are
 * required: if either is missing, null or empty (an unset config value, an
 * untyped caller) the result is null, never the unpinned answer, and it never
 * throws.
 */
export function verifiedMachineOperator(
  context: Pick<Context, 'eddsa' | 'programs'>,
  machine: AssetV1,
  expect: MachineExpectation
): PublicKey | null {
  if (!pinned(expect, ['machineCollection'])) return null;
  return isMachine(context, machine, expect) ? machineOperator(machine) : null;
}

/**
 * The address in a fetched cartridge's link slot, or null if the slot is
 * empty. A slot holding the cartridge's own key is empty too: the retired
 * `insertCartridgeV1` wrote that by mistake.
 *
 * RAW READER: it checks nothing, only what the slot says. Use `isInserted` to
 * decide whether the cartridge may be played on a machine.
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
 * GATE, the decision behind `isInsertedIn`, on accounts already fetched with
 * mpl-core's `fetchAsset`: true only if both are Core accounts, `machine` is at
 * a machine PDA in `expect.machineCollection` (see `isMachine`), the
 * cartridge belongs to `expect.game`, the cartridge's link slot holds the
 * machine's address, and both have the same owner. A machine that is sold or
 * transferred stops carrying the previous owner's cartridges.
 *
 * `expect` is required, with both `machineCollection` and `game`: any wallet
 * can build a self-consistent machine, link and owner out of its own
 * collections, so the trusted pins are what make the answer meaningful. If
 * `expect` or either key is missing, null or empty (an unset config value, an
 * untyped caller) the result is false and nothing throws.
 */
export function isInserted(
  context: Pick<Context, 'eddsa' | 'programs'>,
  input: { cartridge: AssetV1; machine: AssetV1 },
  expect: InsertedExpectation
): boolean {
  if (!pinned(expect, ['machineCollection', 'game'])) return false;
  const { cartridge, machine } = input;
  if (!ownedByCore(context, cartridge)) return false;
  if (!isMachine(context, machine, expect)) return false;
  if (expect.game !== collectionOf(cartridge)) return false;
  if (insertedMachine(cartridge) !== machine.publicKey) return false;
  return cartridge.owner === machine.owner;
}

/**
 * GATE. The operator (the cabinet's device key) of the machine at `machine`,
 * or null if the account is missing, is not a Core asset at a machine PDA in
 * `expect.machineCollection`, or has no operator. `expect` and its
 * `machineCollection` are required: if either is missing, null or empty the
 * result is null and nothing throws.
 *
 * Resolve a device to its machine through the machine address the device
 * registered. Never look a machine up by its operator key: any machine owner
 * can name any key as operator without that key's co-signature.
 */
export async function fetchMachineOperator(
  context: Context,
  machine: PublicKey,
  expect: MachineExpectation
): Promise<PublicKey | null> {
  if (!pinned(expect, ['machineCollection'])) return null;
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
 * RAW READER: the only check is that the cartridge account is owned by
 * mpl-core; it does not check the game, the machine or the owners. Use
 * `isInsertedIn` to decide whether the cartridge may be played on a machine.
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
 * GATE. True if the cartridge at `cartridge` is linked to the machine at
 * `machine`, the machine is at a machine PDA in `expect.machineCollection`,
 * the cartridge belongs to `expect.game`, and both have one owner (see
 * `isInserted`). Fetches both over RPC; a missing or undecodable account gives
 * false.
 *
 * `expect` is required, with both `machineCollection` and `game`. If `expect`
 * or either key is missing, null or empty (an unset config value, an untyped
 * caller) the result is false and nothing throws, never the unpinned answer.
 */
export async function isInsertedIn(
  context: Context,
  cartridge: PublicKey,
  machine: PublicKey,
  expect: InsertedExpectation
): Promise<boolean> {
  if (!pinned(expect, ['machineCollection', 'game'])) return false;
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
