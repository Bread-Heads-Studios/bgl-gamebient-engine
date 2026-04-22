import { Command } from 'commander';
import { publicKey } from '@metaplex-foundation/umi';
import { commissionMachineV1, findMachinePda } from '@breadheads/bgl-cartridge';
import ora from 'ora';
import {
  createContext,
  getOpts,
  handleError,
  loadKeypairAndSign,
} from '../setup';
import { explorerUrl, explorerAccountUrl } from '../utils/constants';
import { printSuccess, printDetail, printHeader } from '../utils/display';

export function registerCommissionMachine(program: Command): void {
  program
    .command('commission-machine')
    .description('Create a new machine NFT in a collection')
    .requiredOption('--name <name>', 'Name for the machine (max 32 chars)')
    .requiredOption('--uri <uri>', 'Metadata URI for the machine')
    .requiredOption(
      '--collection <address>',
      'Machine collection address'
    )
    .option('--owner <address>', 'Owner of the machine (defaults to payer)')
    .action(async (opts, cmd) => {
      const globals = getOpts(cmd);

      try {
        let umi = createContext(globals);
        umi = loadKeypairAndSign(umi, globals.keypair);

        const owner = opts.owner
          ? publicKey(opts.owner)
          : umi.identity.publicKey;

        const machinePda = findMachinePda(umi as any, {
          machineCollection: publicKey(opts.collection) as any,
          name: opts.name,
        });
        const machineAddr = (machinePda as any)[0].toString();

        printHeader('Commission Machine');
        printDetail('Name', opts.name);
        printDetail('URI', opts.uri);
        printDetail('Collection', opts.collection);
        printDetail('Owner', owner.toString());
        printDetail('Machine PDA', machineAddr);
        console.log();

        const spinner = ora('Submitting transaction...').start();

        const builder = commissionMachineV1(umi as any, {
          name: opts.name,
          uri: opts.uri,
          machineCollection: publicKey(opts.collection) as any,
          owner: owner as any,
        });

        const result = await (builder as any).sendAndConfirm(umi);
        const sig = Buffer.from(result.signature).toString('base64');
        spinner.succeed('Transaction confirmed!');

        printSuccess('Machine commissioned successfully!');
        printDetail('Machine', machineAddr);
        printDetail(
          'Explorer',
          explorerAccountUrl(machineAddr, globals.cluster)
        );
        printDetail('Transaction', explorerUrl(sig, globals.cluster));
      } catch (err) {
        handleError(err);
      }
    });
}
