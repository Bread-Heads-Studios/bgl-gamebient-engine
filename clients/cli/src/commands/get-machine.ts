import { Command } from 'commander';
import { publicKey } from '@metaplex-foundation/umi';
import { fetchAsset } from '@metaplex-foundation/mpl-core';
import { base58 } from '@metaplex-foundation/umi/serializers';
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

        let insertedCartridge: string | null = null;
        if (
          (asset as any).appDatas &&
          (asset as any).appDatas.length > 0
        ) {
          try {
            const data = (asset as any).appDatas[0].data;
            if (data.length >= 32) {
              const [decoded] = base58.deserialize(data);
              if (
                decoded &&
                decoded !== '11111111111111111111111111111111'
              ) {
                insertedCartridge = decoded;
              }
            }
          } catch {
            // No cartridge data
          }
        }

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
            insertedCartridge,
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
        printDetail(
          'Cartridge',
          insertedCartridge ?? 'None'
        );
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
