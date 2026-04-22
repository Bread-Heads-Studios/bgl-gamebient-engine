import { Command } from 'commander';
import { publicKey } from '@metaplex-foundation/umi';
import { fetchAsset } from '@metaplex-foundation/mpl-core';
import { createContext, getOpts, handleError } from '../setup';
import { explorerAccountUrl } from '../utils/constants';
import { printHeader, printDetail, printJson } from '../utils/display';

export function registerGetCartridge(program: Command): void {
  program
    .command('get-cartridge')
    .description('Show details for a cartridge')
    .argument('<address>', 'Cartridge asset address')
    .action(async (address: string, _opts, cmd) => {
      const globals = getOpts(cmd);

      try {
        const umi = createContext(globals);
        const asset = await fetchAsset(
          umi as any,
          publicKey(address) as any
        );

        const frozen =
          (asset as any).freezeDelegate?.frozen ?? false;
        const collection =
          (asset as any).updateAuthority?.type === 'Collection'
            ? (asset as any).updateAuthority.address?.toString()
            : undefined;

        const edition = (asset as any).edition;
        const editionNumber = edition?.number;

        if (globals.output === 'json') {
          printJson({
            address,
            name: asset.name,
            uri: asset.uri,
            owner: (asset.owner as any).toString(),
            game: collection,
            edition: editionNumber,
            frozen,
          });
          return;
        }

        printHeader(`Cartridge: ${asset.name}`);
        printDetail('Address', address);
        printDetail('URI', asset.uri);
        printDetail('Owner', (asset.owner as any).toString());
        if (collection) {
          printDetail('Game', collection);
        }
        if (editionNumber !== undefined) {
          printDetail('Edition', editionNumber.toString());
        }
        printDetail(
          'Frozen',
          frozen ? 'Yes (inserted in machine)' : 'No'
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
