export interface GameMetadata {
  name: string;
  description: string;
  image: string;
  external_url?: string;
  attributes: Array<{ trait_type: string; value: string }>;
  properties: {
    files: Array<{ uri: string; type: string }>;
    category: string;
    game_url?: string;
    demo_url?: string;
    binary_url?: string;
    binary_type?: string;
  };
}

export function buildGameMetadata(opts: {
  name: string;
  description: string;
  imageUri: string;
  imageMimeType: string;
  gameUrl?: string;
  demoUrl?: string;
  binaryUrl?: string;
  binaryType?: string;
  genre?: string;
  platform?: string;
  players?: string;
}): GameMetadata {
  const attributes: Array<{ trait_type: string; value: string }> = [];

  if (opts.genre) {
    attributes.push({ trait_type: 'Genre', value: opts.genre });
  }
  if (opts.platform) {
    attributes.push({ trait_type: 'Platform', value: opts.platform });
  }
  if (opts.players) {
    attributes.push({ trait_type: 'Players', value: opts.players });
  }

  const files: Array<{ uri: string; type: string }> = [
    { uri: opts.imageUri, type: opts.imageMimeType },
  ];

  return {
    name: opts.name,
    description: opts.description,
    image: opts.imageUri,
    external_url: opts.gameUrl,
    attributes,
    properties: {
      files,
      category: 'game',
      ...(opts.gameUrl && { game_url: opts.gameUrl }),
      ...(opts.demoUrl && { demo_url: opts.demoUrl }),
      ...(opts.binaryUrl && { binary_url: opts.binaryUrl }),
      ...(opts.binaryType && { binary_type: opts.binaryType }),
    },
  };
}
