export const PROGRAM_ID = 'CART9hmcuf38a58NCYhRJmtGXJjh16eXmLr9hmhAqPZo';
export const PAYMENT_TOKEN_MINT = 'BQDMYwgnWr9UBcUCvLX67yXriTVe1bkPEiTQ1TzKpump';
export const MPL_CORE_PROGRAM_ID = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';

export const CLUSTER_URLS: Record<string, string> = {
  mainnet: 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
  localnet: 'http://127.0.0.1:8899',
};

export const DEFAULT_KEYPAIR_PATH = `${process.env.HOME}/.config/solana/id.json`;

export function explorerUrl(signature: string, cluster: string): string {
  const base = 'https://solana.fm/tx';
  if (cluster === 'mainnet') {
    return `${base}/${signature}`;
  }
  return `${base}/${signature}?cluster=${cluster === 'localnet' ? 'localnet-solana' : cluster}`;
}

export function explorerAccountUrl(address: string, cluster: string): string {
  const base = 'https://solana.fm/address';
  if (cluster === 'mainnet') {
    return `${base}/${address}`;
  }
  return `${base}/${address}?cluster=${cluster === 'localnet' ? 'localnet-solana' : cluster}`;
}
