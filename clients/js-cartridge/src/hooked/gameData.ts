import { publicKey } from '@metaplex-foundation/umi';
import {
  GameCollectionData,
  getGameCollectionDataSerializer,
} from '../generated';

export const CRUMBS_MINT = publicKey(
  'BQDMYwgnWr9UBcUCvLX67yXriTVe1bkPEiTQ1TzKpump'
);
export const USDC_MINT = publicKey(
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
);

/** @deprecated Games now carry their own mint; use CRUMBS_MINT or the game's `paymentMint`. */
export const PAYMENT_TOKEN_MINT = CRUMBS_MINT;

const V0_LEN = 42;
const V1_LEN = 74;

/**
 * Decodes a game's LinkedAppData bytes in either layout. v0 records (released
 * before USDC support) have no mint field and always mean CRUMBS.
 */
export function readGameCollectionData(bytes: Uint8Array): GameCollectionData {
  if (bytes.length === V0_LEN) {
    if (bytes[0] !== 0) {
      throw new Error(`Invalid v0 game data version (${bytes[0]})`);
    }
    // v0 is v1 without the trailing 32-byte mint, so pad it and decode with the
    // generated serializer, then pin the mint to CRUMBS.
    const padded = new Uint8Array(V1_LEN);
    padded.set(bytes);
    const [data] = getGameCollectionDataSerializer().deserialize(padded);
    return { ...data, paymentMint: CRUMBS_MINT };
  }
  if (bytes.length === V1_LEN) {
    if (bytes[0] !== 1) {
      throw new Error(`Invalid v1 game data version (${bytes[0]})`);
    }
    return getGameCollectionDataSerializer().deserialize(bytes)[0];
  }
  throw new Error(`Unknown game data layout (${bytes.length} bytes)`);
}
