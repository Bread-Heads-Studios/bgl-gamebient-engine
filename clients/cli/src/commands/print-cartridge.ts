import { Command } from 'commander';
import { generateSigner, publicKey } from '@metaplex-foundation/umi';
import { findAssociatedTokenPda } from '@metaplex-foundation/mpl-toolbox';
import {
  Currency,
  printGameCartridgeV1,
  findGamePda,
  USDC_MINT,
} from '@breadheads/bgl-cartridge';
import ora from 'ora';
import {
  createContext,
  getOpts,
  handleError,
  loadKeypairAndSign,
} from '../setup';
import { explorerUrl, explorerAccountUrl } from '../utils/constants';
import { printSuccess, printDetail, printHeader } from '../utils/display';

export function registerPrintCartridge(program: Command): void {
  program
    .command('print-cartridge')
    .description('Mint a new game cartridge (buy a copy of a game)')
    .requiredOption('--game <address>', 'Game collection address')
    .requiredOption(
      '--game-name <name>',
      'Game name (for PDA bump derivation)'
    )
    .option('--nonce <n>', 'Game nonce (default: 0)', '0')
    .option(
      '--owner <address>',
      'Owner of the cartridge (defaults to payer)'
    )
    .option(
      '--currency <currency>',
      'Pay with "crumbs" (default) or "usdc" (games with a USDC price only)',
      'crumbs'
    )
    .action(async (opts, cmd) => {
      const globals = getOpts(cmd);

      try {
        let umi = createContext(globals);
        umi = loadKeypairAndSign(umi, globals.keypair);

        const nonce = parseInt(opts.nonce, 10);
        const owner = opts.owner
          ? publicKey(opts.owner)
          : umi.identity.publicKey;
        const cartridge = generateSigner(umi);

        const currencyArg = String(opts.currency).toLowerCase();
        if (currencyArg !== 'crumbs' && currencyArg !== 'usdc') {
          throw new Error(
            `Invalid --currency value "${opts.currency}". Must be "crumbs" or "usdc".`
          );
        }
        const payInUsdc = currencyArg === 'usdc';

        const [, collectionBump] = findGamePda(umi as any, {
          name: opts.gameName,
          nonce,
        });

        // Paying in USDC points every payment account at USDC instead of the
        // defaults, which are the CRUMBS mint and its token accounts.
        const usdcAccounts = payInUsdc
          ? {
              currency: Currency.Usdc,
              paymentMint: USDC_MINT as any,
              gameTokenAccount: findAssociatedTokenPda(umi as any, {
                mint: USDC_MINT as any,
                owner: publicKey(opts.game) as any,
              }) as any,
              payerTokenAccount: findAssociatedTokenPda(umi as any, {
                mint: USDC_MINT as any,
                owner: umi.identity.publicKey as any,
              }) as any,
            }
          : {};

        printHeader('Print Cartridge');
        printDetail('Game', opts.game);
        printDetail('Owner', owner.toString());
        printDetail('Cartridge', cartridge.publicKey.toString());
        printDetail('Nonce', nonce.toString());
        printDetail('Pay with', payInUsdc ? 'USDC' : 'CRUMBS');
        console.log();

        const spinner = ora('Submitting transaction...').start();

        const builder = printGameCartridgeV1(umi as any, {
          game: publicKey(opts.game) as any,
          cartridge: cartridge as any,
          owner: owner as any,
          collectionNonce: nonce,
          collectionBump,
          ...usdcAccounts,
        });

        const result = await (builder as any).sendAndConfirm(umi);
        const sig = Buffer.from(result.signature).toString('base64');
        spinner.succeed('Transaction confirmed!');

        printSuccess('Cartridge minted successfully!');
        printDetail('Cartridge', cartridge.publicKey.toString());
        printDetail(
          'Explorer',
          explorerAccountUrl(
            cartridge.publicKey.toString(),
            globals.cluster
          )
        );
        printDetail('Transaction', explorerUrl(sig, globals.cluster));
      } catch (err) {
        handleError(err);
      }
    });
}
