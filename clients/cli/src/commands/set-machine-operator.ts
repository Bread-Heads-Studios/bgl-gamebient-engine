import { Command } from 'commander';
import { defaultPublicKey, publicKey } from '@metaplex-foundation/umi';
import { setMachineOperatorV1 } from '@breadheads/bgl-cartridge';
import ora from 'ora';
import {
  createContext,
  getOpts,
  handleError,
  loadKeypairAndSign,
} from '../setup';
import { explorerUrl } from '../utils/constants';
import { printSuccess, printDetail, printHeader } from '../utils/display';

export function registerSetMachineOperator(program: Command): void {
  program
    .command('set-machine-operator')
    .description(
      "Set or revoke a machine's operator (the cabinet device key). Signed by the machine's owner"
    )
    .requiredOption('--machine <address>', 'Machine asset address')
    .requiredOption(
      '--machine-collection <address>',
      'Machine collection address'
    )
    .option('--operator <address>', 'New operator (cabinet device key)')
    .option('--revoke', 'Remove the operator')
    .action(async (opts, cmd) => {
      const globals = getOpts(cmd);

      try {
        if (Boolean(opts.operator) === Boolean(opts.revoke)) {
          throw new Error('Pass exactly one of --operator or --revoke');
        }
        // The all-zero key means "no operator" on chain. Refuse it here so a
        // typo cannot silently revoke; --revoke is the explicit way.
        if (opts.operator && publicKey(opts.operator) === defaultPublicKey()) {
          throw new Error(
            'The all-zero key is not a valid operator. Use --revoke to remove the operator.'
          );
        }

        let umi = createContext(globals);
        umi = loadKeypairAndSign(umi, globals.keypair);

        const operator = opts.revoke
          ? defaultPublicKey()
          : publicKey(opts.operator);

        printHeader('Set Machine Operator');
        printDetail('Machine', opts.machine);
        printDetail('Machine Collection', opts.machineCollection);
        printDetail('Operator', opts.revoke ? 'None (revoked)' : opts.operator);
        console.log();

        const spinner = ora('Submitting transaction...').start();

        const builder = setMachineOperatorV1(umi as any, {
          machine: publicKey(opts.machine) as any,
          machineCollection: publicKey(opts.machineCollection) as any,
          owner: umi.identity as any,
          operator: operator as any,
        });

        const result = await (builder as any).sendAndConfirm(umi);
        const sig = Buffer.from(result.signature).toString('base64');
        spinner.succeed('Transaction confirmed!');

        printSuccess('Machine operator updated!');
        printDetail('Transaction', explorerUrl(sig, globals.cluster));
      } catch (err) {
        handleError(err);
      }
    });
}
