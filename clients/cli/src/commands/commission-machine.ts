import { Command } from 'commander';
import { defaultPublicKey, publicKey } from '@metaplex-foundation/umi';
import { commissionMachineV2, findMachinePda } from '@breadheads/bgl-cartridge';
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
    .option(
      '--operator <address>',
      "Cabinet device key allowed to play the machine's cartridges (defaults to none)"
    )
    .action(async (opts, cmd) => {
      const globals = getOpts(cmd);

      try {
        // The all-zero key means "no operator" on chain. Refuse it here so a
        // typo is not taken for a choice; omit --operator for none.
        if (opts.operator && publicKey(opts.operator) === defaultPublicKey()) {
          throw new Error(
            'The all-zero key is not a valid operator. Omit --operator to commission a machine without one.'
          );
        }

        let umi = createContext(globals);
        umi = loadKeypairAndSign(umi, globals.keypair);

        const owner = opts.owner
          ? publicKey(opts.owner)
          : umi.identity.publicKey;
        const operator = opts.operator
          ? publicKey(opts.operator)
          : defaultPublicKey();

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
        printDetail('Operator', opts.operator ?? 'None');
        printDetail('Machine PDA', machineAddr);
        console.log();

        const spinner = ora('Submitting transaction...').start();

        const builder = commissionMachineV2(umi as any, {
          name: opts.name,
          uri: opts.uri,
          machineCollection: publicKey(opts.collection) as any,
          owner: owner as any,
          operator: operator as any,
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
