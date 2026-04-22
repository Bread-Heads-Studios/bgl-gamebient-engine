import { input, select, confirm } from '@inquirer/prompts';
import fs from 'fs';
import path from 'path';

export interface GamePromptResult {
  name: string;
  description: string;
  imagePath: string;
  gameUrl?: string;
  demoUrl?: string;
  binaryUrl?: string;
  binaryType?: string;
  genre?: string;
  platform?: string;
  players?: string;
  priceType: 'transfer' | 'burn';
  price: string;
  nonce: number;
}

export async function gamePrompt(
  prefill?: Partial<GamePromptResult>
): Promise<GamePromptResult> {
  const name =
    prefill?.name ??
    (await input({
      message: 'Game name?',
      validate: (v) => {
        if (!v.trim()) return 'Name is required';
        if (v.length > 32) return 'Name must be 32 characters or less';
        return true;
      },
    }));

  const description = await input({
    message: 'Game description?',
    validate: (v) => (v.trim() ? true : 'Description is required'),
  });

  const imagePath = await input({
    message: 'Cover image path? (PNG, JPG, GIF, WebP)',
    validate: (v) => {
      if (!v.trim()) return 'Image path is required';
      if (!fs.existsSync(v)) return 'File not found';
      const ext = path.extname(v).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
        return 'Must be PNG, JPG, GIF, or WebP';
      }
      return true;
    },
  });

  const gameUrl = await input({
    message: 'Game URL? (web page where the game is hosted, or leave empty)',
  });

  const demoUrl = await input({
    message: 'Demo URL? (link to a playable demo, or leave empty)',
  });

  const hasBinary = await confirm({
    message: 'Does this game have a downloadable binary?',
  });

  let binaryUrl: string | undefined;
  let binaryType: string | undefined;

  if (hasBinary) {
    binaryType = (await select({
      message: 'Binary type?',
      choices: [
        { name: 'Bevy game (.tar)', value: 'bevy-tar' },
        { name: 'PICO-8 cartridge (.p8)', value: 'pico8-p8' },
        { name: 'WASM bundle (.wasm)', value: 'wasm' },
        { name: 'Other', value: 'other' },
      ],
    })) as string;

    binaryUrl = await input({
      message: 'Binary download URL?',
      validate: (v) => (v.trim() ? true : 'URL is required'),
    });
  }

  const genre = await input({
    message: 'Genre? (e.g. Action, Puzzle, RPG — or leave empty)',
  });

  const platform = (await select({
    message: 'Primary platform?',
    choices: [
      { name: 'Web', value: 'Web' },
      { name: 'Desktop (Bevy)', value: 'Desktop' },
      { name: 'PICO-8', value: 'PICO-8' },
      { name: 'Multi-platform', value: 'Multi-platform' },
    ],
  })) as string;

  const players = await input({
    message: 'Number of players? (e.g. 1, 1-4, or leave empty)',
  });

  const priceType = (await select({
    message: 'Price type?',
    choices: [
      {
        name: 'Transfer (tokens go to you)',
        value: 'transfer' as const,
      },
      {
        name: 'Burn (tokens are burned)',
        value: 'burn' as const,
      },
    ],
  })) as 'transfer' | 'burn';

  const price =
    prefill?.price ??
    (await input({
      message: 'Price in payment tokens? (0 for free)',
      default: '0',
      validate: (v) => {
        try {
          BigInt(v);
          return true;
        } catch {
          return 'Must be a valid number';
        }
      },
    }));

  const nonce =
    prefill?.nonce ??
    parseInt(
      await input({
        message: 'Game nonce? (use 0 unless re-releasing)',
        default: '0',
      }),
      10
    );

  return {
    name,
    description,
    imagePath,
    gameUrl: gameUrl || undefined,
    demoUrl: demoUrl || undefined,
    binaryUrl,
    binaryType,
    genre: genre || undefined,
    platform,
    players: players || undefined,
    priceType,
    price,
    nonce,
  };
}
