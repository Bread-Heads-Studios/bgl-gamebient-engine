import { Command } from 'commander';
import { publicKey } from '@metaplex-foundation/umi';
import {
  fetchAllCollectionV1,
  getCollectionV1GpaBuilder,
} from '@metaplex-foundation/mpl-core';
import { getGameCollectionDataSerializer } from '@breadheads/bgl-cartridge';
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
  formatPrice,
  printWarning,
} from '../utils/display';

export function registerListGames(program: Command): void {
  program
    .command('list-games')
    .description('List games (collections) with game data')
    .option(
      '--publisher <address>',
      'Filter by publisher address (defaults to keypair)'
    )
    .action(async (opts, cmd) => {
      const globals = getOpts(cmd);

      try {
        const umi = createContext(globals);

        let publisherAddress: string;
        if (opts.publisher) {
          publisherAddress = opts.publisher;
        } else {
          const signedUmi = loadKeypairAndSign(umi, globals.keypair);
          publisherAddress =
            signedUmi.identity.publicKey.toString();
        }

        const collections = await getCollectionV1GpaBuilder(
          umi as any
        )
          .whereField(
            'updateAuthority',
            publicKey(publisherAddress) as any
          )
          .get();

        if (collections.length === 0) {
          printWarning(
            `No games found for publisher ${publisherAddress}`
          );
          return;
        }

        const games: Array<{
          address: string;
          name: string;
          uri: string;
          numMinted: number;
          price?: string;
          priceType?: string;
        }> = [];

        const pubkeys = collections.map((c: any) => c.publicKey);
        const decoded = await fetchAllCollectionV1(
          umi as any,
          pubkeys
        );

        for (const col of decoded) {
          let price: string | undefined;
          let priceType: string | undefined;

          if (
            (col as any).linkedAppDatas &&
            (col as any).linkedAppDatas.length > 0
          ) {
            try {
              const serializer =
                getGameCollectionDataSerializer();
              const [parsed] = serializer.deserialize(
                (col as any).linkedAppDatas[0].data
              );
              price = formatPrice(parsed.price);
              priceType =
                (parsed.priceType as number) === 1
                  ? 'Burn'
                  : 'Transfer';
            } catch {
              continue;
            }
          } else {
            continue;
          }

          games.push({
            address: (col as any).publicKey.toString(),
            name: col.name,
            uri: col.uri,
            numMinted: col.numMinted,
            price,
            priceType,
          });
        }

        if (globals.output === 'json') {
          printJson(games);
          return;
        }

        if (games.length === 0) {
          printWarning(
            `No games found for publisher ${publisherAddress}`
          );
          return;
        }

        printHeader(
          `Games by ${shortAddress(publisherAddress)}`
        );
        const table = createTable([
          'Address',
          'Name',
          'Editions',
          'Price',
          'Type',
        ]);

        for (const game of games) {
          table.push([
            shortAddress(game.address),
            game.name,
            game.numMinted.toString(),
            game.price ?? '-',
            game.priceType ?? '-',
          ]);
        }

        console.log(table.toString());
        console.log();
      } catch (err) {
        handleError(err);
      }
    });
}
