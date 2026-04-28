import { Command } from 'commander';
import { publicKey } from '@metaplex-foundation/umi';
import {
  findGamePda,
  setCartridgeSourceV1,
  Source,
} from '@breadheads/bgl-cartridge';
import ora from 'ora';
import {
  createContext,
  getOpts,
  handleError,
  loadKeypairAndSign,
} from '../setup';
import { explorerUrl } from '../utils/constants';
import { printSuccess, printDetail, printHeader } from '../utils/display';

export function registerSetCartridgeSource(program: Command): void {
  program
    .command('set-cartridge-source')
    .description(
      'Record the AML payment source on a cartridge (write-once; AML authority only)'
    )
    .requiredOption('--cartridge <address>', 'Cartridge asset address')
    .requiredOption('--game <address>', 'Game collection address')
    .requiredOption(
      '--game-name <name>',
      'Game name (for PDA derivation)'
    )
    .option('--nonce <n>', 'Game nonce (default: 0)', '0')
    .requiredOption(
      '--source <type>',
      'Payment source: "crypto" or "stripe"'
    )
    .action(async (opts, cmd) => {
      const globals = getOpts(cmd);

      try {
        let umi = createContext(globals);
        umi = loadKeypairAndSign(umi, globals.keypair);

        const nonce = parseInt(opts.nonce, 10);
        const sourceArg = String(opts.source).toLowerCase();
        let source: Source;
        if (sourceArg === 'crypto') {
          source = Source.Crypto;
        } else if (sourceArg === 'stripe') {
          source = Source.Stripe;
        } else {
          throw new Error(
            `Invalid --source value "${opts.source}". Must be "crypto" or "stripe".`
          );
        }

        const [, collectionBump] = findGamePda(umi as any, {
          name: opts.gameName,
          nonce,
        });

        printHeader('Set Cartridge Source');
        printDetail('Cartridge', opts.cartridge);
        printDetail('Game', opts.game);
        printDetail('Source', Source[source]);
        printDetail('Authority', umi.identity.publicKey.toString());
        console.log();

        const spinner = ora('Submitting transaction...').start();

        const builder = setCartridgeSourceV1(umi as any, {
          cartridge: publicKey(opts.cartridge) as any,
          game: publicKey(opts.game) as any,
          authority: umi.identity as any,
          collectionNonce: nonce,
          collectionBump,
          source,
        });

        const result = await (builder as any).sendAndConfirm(umi);
        const sig = Buffer.from(result.signature).toString('base64');
        spinner.succeed('Transaction confirmed!');

        printSuccess('Cartridge source recorded!');
        printDetail('Transaction', explorerUrl(sig, globals.cluster));
      } catch (err) {
        handleError(err);
      }
    });
}
