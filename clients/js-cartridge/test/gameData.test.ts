import test from 'ava';
import { generateSigner } from '@metaplex-foundation/umi';
import { createUmi as baseCreateUmi } from '@metaplex-foundation/umi-bundle-tests';
import {
  CRUMBS_MINT,
  getGameCollectionDataSerializer,
  PriceType,
  readGameCollectionData,
  USDC_MINT,
} from '../src';

test('a 42-byte v0 record decodes as CRUMBS', async (t) => {
  const umi = await baseCreateUmi();
  const publisher = generateSigner(umi).publicKey;
  const v1 = getGameCollectionDataSerializer().serialize({
    version: 0,
    priceType: PriceType.Burn,
    price: 50_000_000_000n,
    publisher,
    paymentMint: CRUMBS_MINT,
  });
  const v0 = v1.slice(0, 42);
  t.like(readGameCollectionData(v0), {
    version: 0,
    priceType: PriceType.Burn,
    price: 50_000_000_000n,
    publisher,
    paymentMint: CRUMBS_MINT,
  });
});

test('a 74-byte v1 record decodes with its mint', async (t) => {
  const umi = await baseCreateUmi();
  const publisher = generateSigner(umi).publicKey;
  const bytes = getGameCollectionDataSerializer().serialize({
    version: 1,
    priceType: PriceType.Transfer,
    price: 2_990_000n,
    publisher,
    paymentMint: USDC_MINT,
  });
  t.like(readGameCollectionData(bytes), {
    version: 1,
    price: 2_990_000n,
    paymentMint: USDC_MINT,
  });
});

test('other lengths throw', (t) => {
  t.throws(() => readGameCollectionData(new Uint8Array(10)));
});

test('a 42-byte record whose version is not 0 throws', (t) => {
  const bytes = new Uint8Array(42);
  bytes[0] = 1;
  t.throws(() => readGameCollectionData(bytes), { message: /version/ });
});

test('a 74-byte record whose version is not 1 throws', (t) => {
  const bytes = new Uint8Array(74);
  bytes[0] = 0;
  t.throws(() => readGameCollectionData(bytes), { message: /version/ });
  bytes[0] = 2;
  t.throws(() => readGameCollectionData(bytes), { message: /version/ });
});
