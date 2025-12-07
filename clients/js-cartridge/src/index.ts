import { publicKey } from '@metaplex-foundation/umi';

export * from './generated';
export * from './plugin';
export * from './hooked';

export const PAYMENT_TOKEN_MINT = publicKey!(
  'BQDMYwgnWr9UBcUCvLX67yXriTVe1bkPEiTQ1TzKpump'
);
