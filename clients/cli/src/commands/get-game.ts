import { Command } from 'commander';
import { publicKey } from '@metaplex-foundation/umi';
import { fetchCollection } from '@metaplex-foundation/mpl-core';
import { getGameCollectionDataSerializer } from '@breadheads/bgl-cartridge';
import { createContext, getOpts, handleError } from '../setup';
import { explorerAccountUrl } from '../utils/constants';
import {
  printHeader,
  printDetail,
  printJson,
  formatPrice,
} from '../utils/display';

export function registerGetGame(program: Command): void {
  program
    .command('get-game')
    .description('Show details for a game')
    .argument('<address>', 'Game collection address')
    .action(async (address: string, _opts, cmd) => {
      const globals = getOpts(cmd);

      try {
        const umi = createContext(globals);
        const collection = await fetchCollection(
          umi as any,
          publicKey(address) as any
        );

        let gameData: {
          version: number;
          priceType: number;
          price: bigint;
          publisher: string;
        } | null = null;

        if (
          (collection as any).linkedAppDatas &&
          (collection as any).linkedAppDatas.length > 0
        ) {
          try {
            const raw = (collection as any).linkedAppDatas[0].data;
            const serializer = getGameCollectionDataSerializer();
            const [parsed] = serializer.deserialize(raw);
            gameData = {
              version: parsed.version,
              priceType: parsed.priceType as number,
              price: parsed.price,
              publisher: (parsed.publisher as any).toString(),
            };
          } catch {
            // Not a game collection or data is malformed
          }
        }

        if (globals.output === 'json') {
          printJson({
            address,
            name: collection.name,
            uri: collection.uri,
            numMinted: collection.numMinted,
            currentSize: collection.currentSize,
            ...(gameData ?? {}),
          });
          return;
        }

        printHeader(`Game: ${collection.name}`);
        printDetail('Address', address);
        printDetail('URI', collection.uri);
        printDetail(
          'Editions Minted',
          collection.numMinted.toString()
        );
        printDetail(
          'Current Size',
          collection.currentSize.toString()
        );

        if (gameData) {
          printDetail('Price', formatPrice(gameData.price));
          printDetail(
            'Price Type',
            gameData.priceType === 1 ? 'Burn' : 'Transfer'
          );
          printDetail('Publisher', gameData.publisher);
        }

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
