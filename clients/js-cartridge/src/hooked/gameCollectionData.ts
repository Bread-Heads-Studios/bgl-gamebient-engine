import {
  GameCollectionDataV1,
  getGameCollectionDataSerializer,
  getGameCollectionDataV1Serializer,
} from '../generated';

/**
 * Reads a game collection's LinkedAppData in any stored version and returns
 * it in the version 1 shape. Games released before USDC pricing carry
 * version 0 data (no `usdcPrice`); those read back with `usdcPrice: 0`,
 * meaning the game cannot be bought with USDC. Throws on an unknown version.
 */
export function deserializeGameCollectionData(
  bytes: Uint8Array
): GameCollectionDataV1 {
  switch (bytes[0]) {
    case 0: {
      const [v0] = getGameCollectionDataSerializer().deserialize(bytes);
      return { ...v0, usdcPrice: BigInt(0) };
    }
    case 1:
      return getGameCollectionDataV1Serializer().deserialize(bytes)[0];
    default:
      throw new Error(`Unknown game collection data version ${bytes[0]}`);
  }
}
