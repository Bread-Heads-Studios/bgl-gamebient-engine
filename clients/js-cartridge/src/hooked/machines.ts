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
 * True only for a machine this program commissioned: a Core account sitting at
 * the machine PDA of its own collection and name. It does not say which
 * collection that is. Compare `machine.updateAuthority.address` with the
 * machine collection you trust, because anyone can commission machines in a
 * collection they control.
 */
export function isMachine(
  context: Pick<Context, 'eddsa' | 'programs'>,
  machine: AssetV1
): boolean {
  if (!ownedByCore(context, machine)) return false;
  if (machine.updateAuthority.type !== 'Collection') return false;
  const machineCollection = machine.updateAuthority.address;
  if (!machineCollection) return false;
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
 * The operator (the cabinet's device key) recorded on a fetched machine, or
 * null if it has none: no `MachineData` yet, an unknown layout, or the
 * all-zero key that revokes the operator.
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
 * mpl-core's `fetchAsset`: true only if both are Core accounts, `machine` is a
 * real machine (see `isMachine`), the cartridge's link slot holds the
 * machine's address, and both have the same owner. The owner rule means a
 * machine that is sold or transferred stops carrying the previous owner's
 * cartridges.
 *
 * It does not check which game the cartridge belongs to or which collection
 * the machine is in. The caller checks both against its catalog.
 */
export function isInserted(
  context: Pick<Context, 'eddsa' | 'programs'>,
  input: { cartridge: AssetV1; machine: AssetV1 }
): boolean {
  const { cartridge, machine } = input;
  if (!ownedByCore(context, cartridge)) return false;
  if (!isMachine(context, machine)) return false;
  if (insertedMachine(cartridge) !== machine.publicKey) return false;
  return cartridge.owner === machine.owner;
}

/**
 * The operator (the cabinet's device key) of the machine at `machine`, or
 * null if the account is missing, is not a machine this program commissioned,
 * or has no operator.
 */
export async function fetchMachineOperator(
  context: Context,
  machine: PublicKey
): Promise<PublicKey | null> {
  try {
    const asset = await fetchAsset(context, machine, {
      skipDerivePlugins: true,
    });
    return isMachine(context, asset) ? machineOperator(asset) : null;
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
 * True only if the cartridge at `cartridge` is inserted in the machine at
 * `machine` and may be played there (see `isInserted` for the checks).
 * Fetches both over RPC; a missing or undecodable account gives false.
 */
export async function isInsertedIn(
  context: Context,
  cartridge: PublicKey,
  machine: PublicKey
): Promise<boolean> {
  try {
    const [cartridgeAsset, machineAsset] = await Promise.all([
      fetchAsset(context, cartridge, { skipDerivePlugins: true }),
      fetchAsset(context, machine, { skipDerivePlugins: true }),
    ]);
    return isInserted(context, {
      cartridge: cartridgeAsset,
      machine: machineAsset,
    });
  } catch {
    return false;
  }
}
