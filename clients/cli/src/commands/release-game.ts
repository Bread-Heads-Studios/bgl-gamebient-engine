import { Command } from 'commander';
import { publicKey } from '@metaplex-foundation/umi';
import {
  releaseGameV1,
  findGamePda,
  PriceType,
} from '@breadheads/bgl-cartridge';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import {
  createContext,
  getOpts,
  handleError,
  loadKeypairAndSign,
} from '../setup';
import { explorerUrl, explorerAccountUrl } from '../utils/constants';
import {
  printSuccess,
  printDetail,
  printHeader,
  formatPrice,
} from '../utils/display';
import { attachUploader, uploadImage, uploadJson } from '../lib/upload';
import { buildGameMetadata } from '../lib/gameMetadata';
import { gamePrompt } from '../lib/gamePrompt';

export function registerReleaseGame(program: Command): void {
  program
    .command('release-game')
    .description(
      'Publish a new game — interactive metadata builder with Arweave upload'
    )
    .option('--name <name>', 'Game name (skips interactive prompt for name)')
    .option('--uri <uri>', 'Metadata URI (skip upload, use existing URI)')
    .option('--price <amount>', 'Price in payment tokens')
    .option(
      '--price-type <type>',
      'Price type: transfer or burn',
      'transfer'
    )
    .option('--nonce <n>', 'Nonce for the game PDA (default: 0)', '0')
    .option(
      '--image <path>',
      'Cover image path (skips interactive prompt for image)'
    )
    .action(async (opts, cmd) => {
      const globals = getOpts(cmd);

      try {
        let umi = createContext(globals);
        umi = loadKeypairAndSign(umi, globals.keypair);

        let metadataUri: string;
        let gameName: string;
        let priceType: PriceType;
        let price: bigint;
        let nonce: number;

        if (opts.uri) {
          // Direct mode: user already has a metadata URI
          if (!opts.name) {
            console.error(
              chalk.red('\n  --name is required when using --uri')
            );
            process.exit(1);
          }
          if (!opts.price) {
            console.error(
              chalk.red('\n  --price is required when using --uri')
            );
            process.exit(1);
          }

          metadataUri = opts.uri;
          gameName = opts.name;
          priceType =
            opts.priceType === 'burn'
              ? PriceType.Burn
              : PriceType.Transfer;
          price = BigInt(opts.price);
          nonce = parseInt(opts.nonce, 10);
        } else {
          // Interactive mode: walk through metadata creation
          console.log();
          console.log(
            chalk.bold(
              '  Create Game Metadata'
            )
          );
          console.log(
            chalk.gray(
              '  Build your game metadata and upload to Arweave\n'
            )
          );

          const answers = await gamePrompt({
            name: opts.name,
            price: opts.price,
          });

          gameName = answers.name;
          priceType =
            answers.priceType === 'burn'
              ? PriceType.Burn
              : PriceType.Transfer;
          price = BigInt(answers.price);
          nonce = answers.nonce;

          // Attach uploader and upload
          umi = attachUploader(umi, globals.cluster);

          const imagePath = opts.image || answers.imagePath;
          const ext = path.extname(imagePath).toLowerCase();
          const mimeMap: Record<string, string> = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
          };

          console.log();
          const imageUri = await uploadImage(umi, imagePath);

          const metadata = buildGameMetadata({
            name: gameName,
            description: answers.description,
            imageUri,
            imageMimeType: mimeMap[ext] || 'image/png',
            gameUrl: answers.gameUrl,
            demoUrl: answers.demoUrl,
            binaryUrl: answers.binaryUrl,
            binaryType: answers.binaryType,
            genre: answers.genre,
            platform: answers.platform,
            players: answers.players,
          });

          // Show what we're about to upload
          console.log();
          console.log(
            chalk.gray(
              '  Metadata preview:'
            )
          );
          console.log(
            chalk.gray(
              JSON.stringify(metadata, null, 2)
                .split('\n')
                .map((l) => '    ' + l)
                .join('\n')
            )
          );
          console.log();

          metadataUri = await uploadJson(umi, metadata);
        }

        const gamePda = findGamePda(umi as any, {
          name: gameName,
          nonce,
        });
        const gameAddr = (gamePda as any)[0].toString();

        console.log();
        printHeader('Release Game');
        printDetail('Name', gameName);
        printDetail('Metadata URI', metadataUri);
        printDetail('Price', formatPrice(price));
        printDetail(
          'Price Type',
          priceType === PriceType.Burn ? 'Burn' : 'Transfer'
        );
        printDetail('Nonce', nonce.toString());
        printDetail('Game PDA', gameAddr);
        console.log();

        const spinner = ora('Submitting transaction...').start();

        const builder = releaseGameV1(umi as any, {
          name: gameName,
          uri: metadataUri,
          priceType: priceType as any,
          price,
          nonce,
        });

        const result = await (builder as any).sendAndConfirm(umi);
        const sig = Buffer.from(result.signature).toString('base64');
        spinner.succeed('Transaction confirmed!');

        printSuccess('Game released successfully!');
        printDetail('Game', gameAddr);
        printDetail(
          'Explorer',
          explorerAccountUrl(gameAddr, globals.cluster)
        );
        printDetail('Transaction', explorerUrl(sig, globals.cluster));
        console.log();
      } catch (err) {
        handleError(err);
      }
    });
}
