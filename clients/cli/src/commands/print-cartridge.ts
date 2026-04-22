import { Command } from 'commander';
import { generateSigner, publicKey } from '@metaplex-foundation/umi';
import {
  printGameCartridgeV1,
  findGamePda,
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

        const [, collectionBump] = findGamePda(umi as any, {
          name: opts.gameName,
          nonce,
        });

        printHeader('Print Cartridge');
        printDetail('Game', opts.game);
        printDetail('Owner', owner.toString());
        printDetail('Cartridge', cartridge.publicKey.toString());
        printDetail('Nonce', nonce.toString());
        console.log();

        const spinner = ora('Submitting transaction...').start();

        const builder = printGameCartridgeV1(umi as any, {
          game: publicKey(opts.game) as any,
          cartridge: cartridge as any,
          owner: owner as any,
          collectionNonce: nonce,
          collectionBump,
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
