import { Command } from 'commander';
import { publicKey } from '@metaplex-foundation/umi';
import {
  insertCartridgeV2,
  findGamePda,
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

export function registerInsertCartridge(program: Command): void {
  program
    .command('insert-cartridge')
    .description(
      'Insert a cartridge into a machine. The keypair must own both'
    )
    .requiredOption('--cartridge <address>', 'Cartridge asset address')
    .requiredOption('--game <address>', 'Game collection address')
    .requiredOption('--machine <address>', 'Machine asset address')
    .requiredOption(
      '--machine-collection <address>',
      'Machine collection address'
    )
    .requiredOption(
      '--game-name <name>',
      'Game name (for PDA derivation)'
    )
    .option('--nonce <n>', 'Game nonce (default: 0)', '0')
    .action(async (opts, cmd) => {
      const globals = getOpts(cmd);

      try {
        let umi = createContext(globals);
        umi = loadKeypairAndSign(umi, globals.keypair);

        const nonce = parseInt(opts.nonce, 10);

        const [, collectionBump] = findGamePda(umi as any, {
          name: opts.gameName,
          nonce,
        });

        printHeader('Insert Cartridge');
        printDetail('Cartridge', opts.cartridge);
        printDetail('Game', opts.game);
        printDetail('Machine', opts.machine);
        printDetail('Machine Collection', opts.machineCollection);
        console.log();

        const spinner = ora('Submitting transaction...').start();

        const builder = insertCartridgeV2(umi as any, {
          cartridge: publicKey(opts.cartridge) as any,
          game: publicKey(opts.game) as any,
          owner: umi.identity as any,
          machine: publicKey(opts.machine) as any,
          machineCollection: publicKey(opts.machineCollection) as any,
          collectionNonce: nonce,
          collectionBump,
        });

        const result = await (builder as any).sendAndConfirm(umi);
        const sig = Buffer.from(result.signature).toString('base64');
        spinner.succeed('Transaction confirmed!');

        printSuccess('Cartridge inserted successfully!');
        printDetail('Transaction', explorerUrl(sig, globals.cluster));
      } catch (err) {
        handleError(err);
      }
    });
}
