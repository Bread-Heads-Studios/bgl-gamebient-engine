import { Command } from 'commander';
import { publicKey } from '@metaplex-foundation/umi';
import { fetchAsset } from '@metaplex-foundation/mpl-core';
import { machineOperator } from '@breadheads/bgl-cartridge';
import { createContext, getOpts, handleError } from '../setup';
import { explorerAccountUrl } from '../utils/constants';
import { printHeader, printDetail, printJson } from '../utils/display';

export function registerGetMachine(program: Command): void {
  program
    .command('get-machine')
    .description('Show details for a machine')
    .argument('<address>', 'Machine asset address')
    .action(async (address: string, _opts, cmd) => {
      const globals = getOpts(cmd);

      try {
        const umi = createContext(globals);
        const asset = await fetchAsset(
          umi as any,
          publicKey(address) as any
        );

        const operator = machineOperator(asset as any);

        const collection =
          (asset as any).updateAuthority?.type === 'Collection'
            ? (asset as any).updateAuthority.address?.toString()
            : undefined;

        if (globals.output === 'json') {
          printJson({
            address,
            name: asset.name,
            uri: asset.uri,
            owner: (asset.owner as any).toString(),
            collection,
            operator: operator ? operator.toString() : null,
            frozen: (asset as any).freezeDelegate?.frozen ?? false,
          });
          return;
        }

        printHeader(`Machine: ${asset.name}`);
        printDetail('Address', address);
        printDetail('URI', asset.uri);
        printDetail('Owner', (asset.owner as any).toString());
        if (collection) {
          printDetail('Collection', collection);
        }
        printDetail('Operator', operator ? operator.toString() : 'None');
        printDetail(
          'Explorer',
          explorerAccountUrl(address, globals.cluster)
        );
        console.log();
      } catch (err) {
        handleError(err);
      }
    });
}
