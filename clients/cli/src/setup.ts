import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore } from '@metaplex-foundation/mpl-core';
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import { bglCartridge } from '@breadheads/bgl-cartridge';
import {
  createSignerFromKeypair,
  keypairIdentity,
  Umi,
} from '@metaplex-foundation/umi';
import fs from 'fs';
import chalk from 'chalk';
import { CLUSTER_URLS, DEFAULT_KEYPAIR_PATH } from './utils/constants';

export interface GlobalOptions {
  cluster: string;
  keypair: string;
  output: 'table' | 'json';
}

export function resolveCluster(cluster: string): string {
  if (CLUSTER_URLS[cluster]) {
    return CLUSTER_URLS[cluster];
  }
  if (cluster.startsWith('http://') || cluster.startsWith('https://')) {
    return cluster;
  }
  console.error(
    chalk.red(
      `Invalid cluster: ${cluster}. Use mainnet, devnet, localnet, or a URL.`
    )
  );
  process.exit(1);
}

export function createContext(opts: GlobalOptions): Umi {
  const endpoint = resolveCluster(opts.cluster);
  // Cast plugins to any to avoid duplicate umi type conflicts between
  // the CLI's umi and the cartridge client's bundled umi
  const umi = createUmi(endpoint)
    .use(mplCore() as any)
    .use(mplToolbox() as any)
    .use(bglCartridge() as any);
  return umi;
}

export function loadKeypairAndSign(umi: Umi, keypairPath: string): Umi {
  const resolvedPath = keypairPath || DEFAULT_KEYPAIR_PATH;

  if (!fs.existsSync(resolvedPath)) {
    console.error(chalk.red(`\n  Keypair file not found: ${resolvedPath}`));
    console.error(
      chalk.gray(
        `  Generate one with: solana-keygen new -o ${resolvedPath}`
      )
    );
    console.error(
      chalk.gray(`  Or specify a different path with --keypair <path>`)
    );
    process.exit(1);
  }

  try {
    const secretKey = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
    const keypair = umi.eddsa.createKeypairFromSecretKey(
      new Uint8Array(secretKey)
    );
    const signer = createSignerFromKeypair(umi, keypair);
    return umi.use(keypairIdentity(signer));
  } catch (err) {
    console.error(chalk.red(`\n  Failed to load keypair from: ${resolvedPath}`));
    console.error(chalk.gray(`  Ensure it's a valid JSON keypair file.`));
    process.exit(1);
  }
}

export function getOpts(cmd: {
  parent?: { opts?: () => GlobalOptions };
  optsWithGlobals?: () => GlobalOptions;
}): GlobalOptions {
  if (cmd.optsWithGlobals) {
    return cmd.optsWithGlobals();
  }
  return { cluster: 'mainnet', keypair: DEFAULT_KEYPAIR_PATH, output: 'table' };
}

export function handleError(err: unknown): never {
  if (err instanceof Error) {
    const msg = err.message;

    // Check for insufficient lamports / balance errors (can come from system
    // program CPI and look like "custom program error: 0x1" in the outer msg).
    if (
      msg.includes('insufficient lamports') ||
      msg.includes('insufficient funds') ||
      msg.includes('Insufficient')
    ) {
      console.error(chalk.red('\n  Insufficient funds for this transaction.'));
      console.error(
        chalk.gray('  Check your SOL balance and token balance.')
      );
    } else if (msg.includes('0x')) {
      // Try to attribute the error to the cartridge program by looking for
      // CART... failed pattern.  If the 0x code comes from a CPI'd program
      // (system program, mpl-core, etc.) we should not map it to our errors.
      const cartridgeErrorMatch = msg.match(
        /CART[A-Za-z0-9]+.*?custom program error: 0x([0-9a-fA-F]+)/
      );
      const genericMatch = msg.match(/custom program error: 0x([0-9a-fA-F]+)/);

      if (cartridgeErrorMatch) {
        const code = parseInt(cartridgeErrorMatch[1], 16);
        const errorName = programErrorName(code);
        if (errorName) {
          console.error(chalk.red(`\n  Program Error: ${errorName}`));
        } else {
          console.error(chalk.red(`\n  Program Error (code ${code}): ${msg}`));
        }
      } else if (genericMatch) {
        // Error is from a CPI'd program, not ours — show the raw message
        // with extra context to help debugging.
        const code = parseInt(genericMatch[1], 16);
        console.error(
          chalk.red(`\n  Transaction failed (CPI error code ${code}).`)
        );
        // Surface common CPI errors
        if (code === 1) {
          console.error(
            chalk.gray(
              '  This is often caused by insufficient SOL for rent. Check your balance.'
            )
          );
        }
      } else {
        console.error(chalk.red(`\n  Error: ${msg}`));
      }
    } else {
      console.error(chalk.red(`\n  Error: ${msg}`));
    }

    // Show raw logs if available for debugging
    const logs = (err as any).logs as string[] | undefined;
    if (logs) {
      const relevant = logs.filter(
        (l: string) => l.includes('failed') || l.includes('Error') || l.includes('insufficient')
      );
      if (relevant.length > 0) {
        console.error(chalk.gray('\n  Logs:'));
        relevant.forEach((l: string) => console.error(chalk.gray(`    ${l}`)));
      }
    }
  } else {
    console.error(chalk.red(`\n  Unknown error occurred.`));
  }
  process.exit(1);
}

const ERROR_CODES: Record<number, string> = {
  0: 'InvalidSystemProgram',
  1: 'DeserializationError',
  2: 'SerializationError',
  3: 'InvalidMplCoreProgram',
  4: 'InvalidName',
  5: 'InvalidUri',
  6: 'PayerMustSign',
  7: 'AuthorityMustSign',
  8: 'InvalidMachinePdaDerivation',
  9: 'CartridgeOwnerMustSign',
  10: 'InvalidGamePdaDerivation',
  11: 'CartridgeAlreadyInserted',
  12: 'CartridgeNotInserted',
  13: 'InvalidTokenProgram',
  14: 'InvalidPayerTokenAccountProgramOwner',
  15: 'InvalidPayerTokenAccountOwner',
  16: 'InvalidPayerTokenAccountMint',
  17: 'InvalidGameTokenAccountProgramOwner',
  18: 'InvalidGameTokenAccountOwner',
  19: 'InvalidGameTokenAccountMint',
  20: 'InvalidPaymentMint',
  21: 'InvalidAssociatedTokenProgram',
};

function programErrorName(code: number): string | undefined {
  return ERROR_CODES[code];
}
