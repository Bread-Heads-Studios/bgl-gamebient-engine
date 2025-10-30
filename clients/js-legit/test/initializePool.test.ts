import { generateSigner } from '@metaplex-foundation/umi';
import test from 'ava';
import {
  createMint,
  findAssociatedTokenPda,
  getSplAssociatedTokenProgramId,
} from '@metaplex-foundation/mpl-toolbox';
import { initializePoolV1, findPoolPda } from '../src';
import { createUmi } from './_setup';

test('it can initialize a staking pool', async (t) => {
  // Given a Umi instance and a token mint.
  const umi = await createUmi();
  const authority = umi.identity;
  const mint = generateSigner(umi);

  // Create a token mint for staking
  await createMint(umi, {
    mint,
    decimals: 9,
    mintAuthority: authority.publicKey,
    freezeAuthority: null,
  }).sendAndConfirm(umi);

  // Derive pool PDA
  const pool = findPoolPda(umi, {
    authority: authority.publicKey,
    mint: mint.publicKey,
  });

  // Derive pool token account (vault)
  const poolTokenAccount = findAssociatedTokenPda(umi, {
    mint: mint.publicKey,
    owner: pool[0],
  });

  // When we initialize a staking pool.
  await initializePoolV1(umi, {
    pool,
    mint: mint.publicKey,
    poolTokenAccount,
    padding: [0, 0, 0, 0, 0, 0, 0],
    machineOwnerConfig: {
      rewardRate: 100, // 100 tokens per period
      lockupPeriod: 86400, // 1 day in seconds
    },
    gameCreatorConfig: {
      rewardRate: 200, // 200 tokens per period
      lockupPeriod: 172800, // 2 days in seconds
    },
    associatedTokenProgram: getSplAssociatedTokenProgramId(umi),
  }).sendAndConfirm(umi);

  // Then the pool was created successfully.
  t.pass();
});

test('it cannot initialize a pool with duplicate configuration', async (t) => {
  // Given a Umi instance with an existing pool.
  const umi = await createUmi();
  const authority = umi.identity;
  const mint = generateSigner(umi);

  // Create a token mint for staking
  await createMint(umi, {
    mint,
    decimals: 9,
    mintAuthority: authority.publicKey,
    freezeAuthority: null,
  }).sendAndConfirm(umi);

  // Derive pool PDA
  const pool = findPoolPda(umi, {
    authority: authority.publicKey,
    mint: mint.publicKey,
  });

  // Derive pool token account (vault)
  const poolTokenAccount = findAssociatedTokenPda(umi, {
    mint: mint.publicKey,
    owner: pool[0],
  });

  // Initialize the first pool
  await initializePoolV1(umi, {
    pool,
    mint: mint.publicKey,
    poolTokenAccount,
    padding: [0, 0, 0, 0, 0, 0, 0],
    machineOwnerConfig: {
      rewardRate: 100,
      lockupPeriod: 86400,
    },
    gameCreatorConfig: {
      rewardRate: 200,
      lockupPeriod: 172800,
    },
    associatedTokenProgram: getSplAssociatedTokenProgramId(umi),
  }).sendAndConfirm(umi);

  // When we try to initialize the same pool again.
  // Then we expect an error.
  await t.throwsAsync(
    initializePoolV1(umi, {
      pool,
      mint: mint.publicKey,
      poolTokenAccount,
      padding: [0, 0, 0, 0, 0, 0, 0],
      machineOwnerConfig: {
        rewardRate: 150,
        lockupPeriod: 43200,
      },
      gameCreatorConfig: {
        rewardRate: 250,
        lockupPeriod: 86400,
      },
      associatedTokenProgram: getSplAssociatedTokenProgramId(umi),
    }).sendAndConfirm(umi)
  );
});

test('it can initialize multiple pools with different mints', async (t) => {
  // Given a Umi instance and two different token mints.
  const umi = await createUmi();
  const authority = umi.identity;
  const mint1 = generateSigner(umi);
  const mint2 = generateSigner(umi);

  // Create first token mint
  await createMint(umi, {
    mint: mint1,
    decimals: 9,
    mintAuthority: authority.publicKey,
    freezeAuthority: null,
  }).sendAndConfirm(umi);

  // Create second token mint
  await createMint(umi, {
    mint: mint2,
    decimals: 9,
    mintAuthority: authority.publicKey,
    freezeAuthority: null,
  }).sendAndConfirm(umi);

  // Derive pool PDAs for each mint
  const pool1 = findPoolPda(umi, {
    authority: authority.publicKey,
    mint: mint1.publicKey,
  });

  const pool2 = findPoolPda(umi, {
    authority: authority.publicKey,
    mint: mint2.publicKey,
  });

  // Derive pool token accounts (vaults)
  const poolTokenAccount1 = findAssociatedTokenPda(umi, {
    mint: mint1.publicKey,
    owner: pool1[0],
  });

  const poolTokenAccount2 = findAssociatedTokenPda(umi, {
    mint: mint2.publicKey,
    owner: pool2[0],
  });

  // When we initialize both pools.
  await initializePoolV1(umi, {
    pool: pool1,
    mint: mint1.publicKey,
    poolTokenAccount: poolTokenAccount1,
    authority: authority,
    padding: [0, 0, 0, 0, 0, 0, 0],
    machineOwnerConfig: {
      rewardRate: 100,
      lockupPeriod: 86400,
    },
    gameCreatorConfig: {
      rewardRate: 200,
      lockupPeriod: 172800,
    },
    associatedTokenProgram: getSplAssociatedTokenProgramId(umi),
  }).sendAndConfirm(umi);

  await initializePoolV1(umi, {
    pool: pool2,
    mint: mint2.publicKey,
    poolTokenAccount: poolTokenAccount2,
    padding: [0, 0, 0, 0, 0, 0, 0],
    machineOwnerConfig: {
      rewardRate: 150,
      lockupPeriod: 43200,
    },
    gameCreatorConfig: {
      rewardRate: 250,
      lockupPeriod: 86400,
    },
    associatedTokenProgram: getSplAssociatedTokenProgramId(umi),
  }).sendAndConfirm(umi);

  // Then both pools were created successfully.
  t.pass();
});
