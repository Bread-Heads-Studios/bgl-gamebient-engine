/* eslint-disable import/no-extraneous-dependencies */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createUmi as basecreateUmi } from '@metaplex-foundation/umi-bundle-tests';
import {
  createAssociatedToken,
  findAssociatedTokenPda,
  mintTokensTo,
  mplToolbox,
} from '@metaplex-foundation/mpl-toolbox';
import {
  createSignerFromKeypair,
  generateSigner,
  publicKey,
  PublicKey,
  Signer,
  transactionBuilder,
  Umi,
} from '@metaplex-foundation/umi';
import {
  bglCartridge,
  CRUMBS_MINT,
  findGamePda,
  findLookPda,
  PriceType,
  printGameCartridgeV1,
  registerLookV1,
  releaseGameV1,
  USDC_MINT,
} from '../src';

export const createUmi = async () => {
  const umi = (await basecreateUmi()).use(mplToolbox()).use(bglCartridge());

  // Create a CRUMBS token account for the identity.
  await createAssociatedToken(umi, {
    mint: CRUMBS_MINT,
    owner: umi.identity.publicKey,
  }).sendAndConfirm(umi);
  return umi;
};

/** The localnet authority: AML source authority and the local USDC mint authority. */
export const loadLocalnetAuthority = (umi: Umi): Signer => {
  // ava runs the compiled tests from dist/test/; fixtures stay in test/fixtures/.
  const path = join(
    __dirname,
    '..',
    '..',
    'test',
    'fixtures',
    'source-authority.json'
  );
  const secret = new Uint8Array(JSON.parse(readFileSync(path, 'utf-8')));
  return createSignerFromKeypair(
    umi,
    umi.eddsa.createKeypairFromSecretKey(secret)
  );
};

/**
 * Creates `owner`'s token account for `mint` if needed and mints `amount` base
 * units into it. Works for the local USDC and CRUMBS mints, whose authority is
 * the localnet authority.
 */
export const fundToken = async (
  umi: Umi,
  mint: PublicKey,
  owner: PublicKey,
  amount: bigint
) => {
  const [token] = findAssociatedTokenPda(umi, { mint, owner });
  // createIdempotentAssociatedToken fails on an account that already exists
  // (IllegalOwner on this validator), and the persistent validator keeps
  // accounts between runs, so create only when it is missing.
  let builder = transactionBuilder();
  if (!(await umi.rpc.accountExists(token))) {
    builder = builder.add(createAssociatedToken(umi, { mint, owner }));
  }
  await builder
    .add(
      mintTokensTo(umi, {
        mint,
        token,
        amount,
        mintAuthority: loadLocalnetAuthority(umi),
      })
    )
    .sendAndConfirm(umi);
};

export const fundUsdc = (umi: Umi, owner: PublicKey, amount: bigint) =>
  fundToken(umi, USDC_MINT, owner, amount);

/** Releases a free CRUMBS game with a random name. */
export const releaseFreeGame = async (umi: Umi) => {
  const name = Math.random().toString(36).substring(2, 15);
  const [game, gameBump] = findGamePda(umi, { name, nonce: 0 });
  await releaseGameV1(umi, {
    name,
    uri: 'https://test-game.com',
    priceType: PriceType.Burn,
    price: 0,
  }).sendAndConfirm(umi);
  return { name, game: publicKey(game), gameBump };
};

/** Prints a cartridge of a free game, owned by `owner`, paid by `umi.identity`. */
export const printCartridge = async (
  umi: Umi,
  game: { game: PublicKey; gameBump: number },
  owner: PublicKey
) => {
  const cartridge = generateSigner(umi);
  await printGameCartridgeV1(umi, {
    game: game.game,
    cartridge,
    owner,
    collectionNonce: 0,
    collectionBump: game.gameBump,
  }).sendAndConfirm(umi);
  return cartridge;
};

export const LOOK_URI = 'https://look.example/fae.json';
export const LOOK_NAME = 'Fae Wilds';

/** Registers a look for `game`. Fields can be overridden to provoke errors. */
export const registerTestLook = async (
  umi: Umi,
  game: { name: string; game: PublicKey },
  options: {
    creator?: Signer;
    lookId?: string;
    name?: string;
    uri?: string;
    priceType?: PriceType;
    price?: number | bigint;
    mint?: PublicKey;
    publisherBps?: number;
    protocolBps?: number;
  } = {}
) => {
  const creator = options.creator ?? generateSigner(umi);
  const lookId = options.lookId ?? 'fae-wilds';
  const mint = options.mint ?? USDC_MINT;
  const look = publicKey(
    findLookPda(umi, { game: game.game, creator: creator.publicKey, lookId })
  );
  const builder = registerLookV1(umi, {
    look,
    game: game.game,
    creator,
    paymentMint: mint,
    lookId,
    name: options.name ?? LOOK_NAME,
    uri: options.uri ?? LOOK_URI,
    gameName: game.name,
    gameNonce: 0,
    priceType: options.priceType ?? PriceType.Transfer,
    price: options.price ?? 1_500_000,
    paymentMintChoice: mint,
    contentHash: new Uint8Array(32).fill(7),
    schema: 1,
    publisherBps: options.publisherBps ?? 0,
    protocolBps: options.protocolBps ?? 0,
  });
  return { builder, look, creator, lookId };
};
