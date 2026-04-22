import { Command } from 'commander';
import { publicKey } from '@metaplex-foundation/umi';
import {
  getAssetV1GpaBuilder,
  fetchAllAssetV1,
} from '@metaplex-foundation/mpl-core';
import { base58 } from '@metaplex-foundation/umi/serializers';
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

export function registerListMachines(program: Command): void {
  program
    .command('list-machines')
    .description('List machines owned by a wallet')
    .option(
      '--owner <address>',
      'Owner address (defaults to keypair)'
    )
    .option(
      '--collection <address>',
      'Filter by machine collection'
    )
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
          printWarning(`No machines found for ${ownerAddress}`);
          return;
        }

        const pubkeys = rawAssets.map((a: any) => a.publicKey);
        const assets = await fetchAllAssetV1(
          umi as any,
          pubkeys
        );

        const machines: Array<{
          address: string;
          name: string;
          collection?: string;
          cartridge: string;
        }> = [];

        for (const asset of assets) {
          if (
            !(asset as any).appDatas ||
            (asset as any).appDatas.length === 0
          )
            continue;

          let cartridge = 'None';
          try {
            const data = (asset as any).appDatas[0].data;
            if (data.length >= 32) {
              const [decoded] = base58.deserialize(data);
              if (
                decoded &&
                decoded !==
                  '11111111111111111111111111111111'
              ) {
                cartridge = decoded;
              }
            }
          } catch {
            // No cartridge
          }

          const collection =
            (asset as any).updateAuthority?.type === 'Collection'
              ? (asset as any).updateAuthority.address?.toString()
              : undefined;

          machines.push({
            address: (asset as any).publicKey.toString(),
            name: asset.name,
            collection,
            cartridge,
          });
        }

        if (globals.output === 'json') {
          printJson(machines);
          return;
        }

        if (machines.length === 0) {
          printWarning(`No machines found for ${ownerAddress}`);
          return;
        }

        printHeader(
          `Machines owned by ${shortAddress(ownerAddress)}`
        );
        const table = createTable([
          'Address',
          'Name',
          'Collection',
          'Cartridge',
        ]);

        for (const m of machines) {
          table.push([
            shortAddress(m.address),
            m.name,
            m.collection
              ? shortAddress(m.collection)
              : '-',
            m.cartridge === 'None'
              ? 'None'
              : shortAddress(m.cartridge),
          ]);
        }

        console.log(table.toString());
        console.log();
      } catch (err) {
        handleError(err);
      }
    });
}
