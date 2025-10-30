import { generateSigner } from '@metaplex-foundation/umi';
import test from 'ava';
import {
  createMint,
  findAssociatedTokenPda,
  getSplAssociatedTokenProgramId,
} from '@metaplex-foundation/mpl-toolbox';
import { initializePoolV1, findPoolPda, updatePoolV1 } from '../src';
import { createUmi } from './_setup';

test('it can update pool configuration as authority', async (t) => {
  // Given a Umi instance with an initialized pool.
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

  // Initialize the pool
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

  // When we update the pool configuration as authority.
  await updatePoolV1(umi, {
    pool,
    padding1: [0, 0, 0, 0, 0, 0, 0],
    machineOwnerConfig: {
      rewardRate: 150, // Increased
      lockupPeriod: 43200, // Reduced
    },
    gameCreatorConfig: {
      rewardRate: 250, // Increased
      lockupPeriod: 86400, // Reduced
    },
    isActive: 1,
    padding2: [0, 0, 0, 0, 0, 0, 0],
  }).sendAndConfirm(umi);

  // Then the update was successful.
  t.pass();
});

test('it cannot update pool without authority', async (t) => {
  // Given a Umi instance with an initialized pool.
  const umi = await createUmi();
  const authority = umi.identity;
  const mint = generateSigner(umi);
  const unauthorizedUser = generateSigner(umi);

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

  // Initialize the pool
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

  // When we try to update the pool without proper authority.
  // Then we expect an error.
  await t.throwsAsync(
    updatePoolV1(umi, {
      pool,
      authority: unauthorizedUser,
      padding1: [0, 0, 0, 0, 0, 0, 0],
      machineOwnerConfig: {
        rewardRate: 150,
        lockupPeriod: 43200,
      },
      gameCreatorConfig: {
        rewardRate: 250,
        lockupPeriod: 86400,
      },
      isActive: 1,
      padding2: [0, 0, 0, 0, 0, 0, 0],
    }).sendAndConfirm(umi)
  );
});

test('it can deactivate a pool', async (t) => {
  // Given a Umi instance with an initialized pool.
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

  // Initialize the pool
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

  // When we deactivate the pool.
  await updatePoolV1(umi, {
    pool,
    padding1: [0, 0, 0, 0, 0, 0, 0],
    machineOwnerConfig: {
      rewardRate: 100,
      lockupPeriod: 86400,
    },
    gameCreatorConfig: {
      rewardRate: 200,
      lockupPeriod: 172800,
    },
    isActive: 0, // Deactivate
    padding2: [0, 0, 0, 0, 0, 0, 0],
  }).sendAndConfirm(umi);

  // Then the pool was deactivated successfully.
  t.pass();
});
