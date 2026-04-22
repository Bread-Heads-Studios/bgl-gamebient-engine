import { createGenericFile, Umi } from '@metaplex-foundation/umi';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

export function attachUploader(umi: Umi, cluster: string): Umi {
  const irysAddress =
    cluster === 'devnet'
      ? 'https://devnet.irys.xyz'
      : 'https://node1.irys.xyz';

  return umi.use(irysUploader({ address: irysAddress }) as any);
}

export async function uploadImage(
  umi: Umi,
  imagePath: string
): Promise<string> {
  if (!fs.existsSync(imagePath)) {
    console.error(chalk.red(`\n  Image file not found: ${imagePath}`));
    process.exit(1);
  }

  const file = fs.readFileSync(imagePath);
  const mimeType = getMimeType(imagePath);
  const fileName = path.basename(imagePath);

  const genericFile = createGenericFile(file, fileName, {
    tags: [{ name: 'Content-Type', value: mimeType }],
  });

  const spinner = ora('Uploading image to Arweave...').start();

  try {
    const [uri] = await umi.uploader.upload([genericFile]);
    if (!uri) throw new Error('Upload returned no URI');
    spinner.succeed(`Image uploaded: ${uri}`);
    return uri;
  } catch (err) {
    spinner.fail('Image upload failed');
    throw err;
  }
}

export async function uploadJson(
  umi: Umi,
  json: object
): Promise<string> {
  const spinner = ora('Uploading metadata to Arweave...').start();

  try {
    const uri = await umi.uploader.uploadJson(json);
    if (!uri) throw new Error('Upload returned no URI');
    spinner.succeed(`Metadata uploaded: ${uri}`);
    return uri;
  } catch (err) {
    spinner.fail('Metadata upload failed');
    throw err;
  }
}
