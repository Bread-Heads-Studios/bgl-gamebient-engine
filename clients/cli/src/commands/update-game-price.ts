import { Command } from 'commander';
import { publicKey } from '@metaplex-foundation/umi';
import { fetchCollection } from '@metaplex-foundation/mpl-core';
import {
  findGamePda,
  PriceType,
  updateGamePriceV1,
} from '@breadheads/bgl-cartridge';
import ora from 'ora';
import {
  createContext,
  getOpts,
  handleError,
  loadKeypairAndSign,
} from '../setup';
import { explorerUrl } from '../utils/constants';
import {
  printSuccess,
  printDetail,
  printHeader,
  formatPrice,
} from '../utils/display';

export function registerUpdateGamePrice(program: Command): void {
  program
    .command('update-game-price')
    .description(
      'Change the price and payment type of a game (publisher only)'
    )
    .requiredOption('--game <address>', 'Game collection address')
    .requiredOption('--price <amount>', 'New price in payment tokens')
    .option(
      '--price-type <type>',
      'Payment type: transfer or burn',
      'transfer'
    )
    .option('--nonce <n>', 'Game nonce (default: 0)', '0')
    .action(async (opts, cmd) => {
      const globals = getOpts(cmd);

      try {
        let umi = createContext(globals);
        umi = loadKeypairAndSign(umi, globals.keypair);

        const nonce = parseInt(opts.nonce, 10);
        const typeArg = String(opts.priceType).toLowerCase();
        let priceType: PriceType;
        if (typeArg === 'transfer') {
          priceType = PriceType.Transfer;
        } else if (typeArg === 'burn') {
          priceType = PriceType.Burn;
        } else {
          throw new Error(
            `Invalid --price-type value "${opts.priceType}". Must be "transfer" or "burn".`
          );
        }
        if (!/^\d+$/.test(String(opts.price))) {
          throw new Error(
            `Invalid --price value "${opts.price}". Must be a non-negative integer in base units.`
          );
        }
        const price = BigInt(opts.price);

        // The PDA seeds use the on-chain collection name, so read it back
        // rather than asking for it.
        const collection = await fetchCollection(
          umi as any,
          publicKey(opts.game) as any
        );
        const [derived, collectionBump] = findGamePda(umi as any, {
          name: collection.name,
          nonce,
        });
        if (derived.toString() !== opts.game) {
          throw new Error(
            `Game ${opts.game} is not the PDA for "${collection.name}" at nonce ${nonce}. Pass the right --nonce.`
          );
        }

        printHeader('Update Game Price');
        printDetail('Game', opts.game);
        printDetail('Name', collection.name);
        printDetail('New Price', formatPrice(price));
        printDetail(
          'New Price Type',
          priceType === PriceType.Burn ? 'Burn' : 'Transfer'
        );
        printDetail('Publisher', umi.identity.publicKey.toString());
        console.log();

        const spinner = ora('Submitting transaction...').start();

        const builder = updateGamePriceV1(umi as any, {
          game: publicKey(opts.game) as any,
          authority: umi.identity as any,
          collectionNonce: nonce,
          collectionBump,
          priceType: priceType as any,
          price,
        });

        const result = await (builder as any).sendAndConfirm(umi);
        const sig = Buffer.from(result.signature).toString('base64');
        spinner.succeed('Transaction confirmed!');

        printSuccess('Game price updated!');
        printDetail('Transaction', explorerUrl(sig, globals.cluster));
      } catch (err) {
        handleError(err);
      }
    });
}
