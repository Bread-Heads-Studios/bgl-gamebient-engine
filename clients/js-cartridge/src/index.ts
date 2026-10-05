import { publicKey } from '@metaplex-foundation/umi';

export * from './generated';
export * from './plugin';
export * from './hooked';

export const PAYMENT_TOKEN_MINT = publicKey!(
  'BQDMYwgnWr9UBcUCvLX67yXriTVe1bkPEiTQ1TzKpump'
);

/** USDC on mainnet: the stable alternative price a game may accept. */
export const USDC_MINT = publicKey!(
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
);

/**
 * The USDC stand-in the program accepts on a localnet (epoch zero). Its
 * keypair is `test/fixtures/usdc-mint.json`; tests create and mint it.
 */
export const LOCALNET_USDC_MINT = publicKey!(
  'CKmDJxVA4jUKHbEw2NX77RcY49nb87SEoBdUHzR7hjYE'
);
