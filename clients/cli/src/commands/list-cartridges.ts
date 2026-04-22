import { Command } from 'commander';
import { publicKey } from '@metaplex-foundation/umi';
import {
  getAssetV1GpaBuilder,
  fetchAllAssetV1,
} from '@metaplex-foundation/mpl-core';
import {
  createContext,
  getOpts,
  handleError,
  loadKeypairAndSign,
} from '../setup';
import {
  createTable,
  printHeader,
  printJson,
  shortAddress,
  printWarning,
} from '../utils/display';

export function registerListCartridges(program: Command): void {
  program
    .command('list-cartridges')
    .description('List cartridges owned by a wallet')
    .option(
      '--owner <address>',
      'Owner address (defaults to keypair)'
    )
    .option('--game <address>', 'Filter by game collection')
    .action(async (opts, cmd) => {
      const globals = getOpts(cmd);

      try {
        const umi = createContext(globals);

        let ownerAddress: string;
        if (opts.owner) {
          ownerAddress = opts.owner;
        } else {
          const signedUmi = loadKeypairAndSign(
            umi,
            globals.keypair
          );
          ownerAddress =
            signedUmi.identity.publicKey.toString();
        }

        const builder = getAssetV1GpaBuilder(umi as any).whereField(
          'owner',
          publicKey(ownerAddress) as any
        );

        const rawAssets = await builder.get();

        if (rawAssets.length === 0) {
          printWarning(
            `No cartridges found for ${ownerAddress}`
          );
          return;
        }

        const pubkeys = rawAssets.map((a: any) => a.publicKey);
        const assets = await fetchAllAssetV1(
          umi as any,
          pubkeys
        );

        const cartridges: Array<{
          address: string;
          name: string;
          game?: string;
          edition?: number;
          frozen: boolean;
        }> = [];

        for (const asset of assets) {
          const edition = (asset as any).edition;
          if (!edition) continue;

          const frozen =
            (asset as any).freezeDelegate?.frozen ?? false;
          const game =
            (asset as any).updateAuthority?.type === 'Collection'
              ? (asset as any).updateAuthority.address?.toString()
              : undefined;

          cartridges.push({
            address: (asset as any).publicKey.toString(),
            name: asset.name,
            game,
            edition: edition.number,
            frozen,
          });
        }

        if (globals.output === 'json') {
          printJson(cartridges);
          return;
        }

        if (cartridges.length === 0) {
          printWarning(
            `No cartridges found for ${ownerAddress}`
          );
          return;
        }

        printHeader(
          `Cartridges owned by ${shortAddress(ownerAddress)}`
        );
        const table = createTable([
          'Address',
          'Name',
          'Game',
          'Edition',
          'Status',
        ]);

        for (const c of cartridges) {
          table.push([
            shortAddress(c.address),
            c.name,
            c.game ? shortAddress(c.game) : '-',
            c.edition?.toString() ?? '-',
            c.frozen ? 'Inserted' : 'Free',
          ]);
        }

        console.log(table.toString());
        console.log();
      } catch (err) {
        handleError(err);
      }
    });
}
