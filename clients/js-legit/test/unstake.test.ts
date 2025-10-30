import { generateSigner } from '@metaplex-foundation/umi';
import test from 'ava';
import {
  createMint,
  createAssociatedToken,
  findAssociatedTokenPda,
  getSplAssociatedTokenProgramId,
  mintTokensTo,
} from '@metaplex-foundation/mpl-toolbox';
import {
  initializePoolV1,
  findPoolPda,
  createStakeV1,
  findStakeAccountPda,
  unstakeV1,
  StakerType,
} from '../src';
import { createUmi } from './_setup';

test('it can unstake tokens after lockup period', async (t) => {
  // Given a Umi instance with an initialized pool and stake.
  const umi = await createUmi();
  const authority = umi.identity;
  const mint = generateSigner(umi);
  const staker = generateSigner(umi);

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

  // Initialize the pool with short lockup for testing
  await initializePoolV1(umi, {
    pool,
    mint: mint.publicKey,
    poolTokenAccount,
    padding: [0, 0, 0, 0, 0, 0, 0],
    machineOwnerConfig: {
      rewardRate: 100,
      lockupPeriod: 0, // No lockup for testing
    },
    gameCreatorConfig: {
      rewardRate: 200,
      lockupPeriod: 0,
    },
    associatedTokenProgram: getSplAssociatedTokenProgramId(umi),
  }).sendAndConfirm(umi);

  // Create staker's token account and mint tokens
  const stakerTokenAccount = findAssociatedTokenPda(umi, {
    mint: mint.publicKey,
    owner: staker.publicKey,
  });

  await createAssociatedToken(umi, {
    mint: mint.publicKey,
    owner: staker.publicKey,
  }).sendAndConfirm(umi);

  await mintTokensTo(umi, {
    mint: mint.publicKey,
    token: stakerTokenAccount,
    amount: 1000,
  }).sendAndConfirm(umi);

  // Derive stake account PDA
  const stakeAccount = findStakeAccountPda(umi, {
    pool: pool[0],
    staker: staker.publicKey,
  });

  // Use poolTokenAccount as vault for other operations
  const vault = poolTokenAccount;

  // Create a stake
  await createStakeV1(umi, {
    pool,
    stakeAccount,
    staker,
    stakerTokenAccount,
    vault,
    stakerType: StakerType.MachineOwner,
    padding: [0, 0, 0, 0, 0, 0],
    amount: 500,
  }).sendAndConfirm(umi);

  // Derive vault authority (pool PDA)
  const vaultAuthority = pool;

  // When we unstake tokens.
  await unstakeV1(umi, {
    pool,
    stakeAccount,
    staker,
    stakerTokenAccount,
    vault,
    vaultAuthority,
    padding: [0, 0, 0, 0, 0, 0, 0],
    amount: 250,
  }).sendAndConfirm(umi);

  // Then the unstake was successful.
  t.pass();
});

test('it cannot unstake more than staked amount', async (t) => {
  // Given a Umi instance with an initialized pool and stake.
  const umi = await createUmi();
  const authority = umi.identity;
  const mint = generateSigner(umi);
  const staker = generateSigner(umi);

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
      lockupPeriod: 0,
    },
    gameCreatorConfig: {
      rewardRate: 200,
      lockupPeriod: 0,
    },
    associatedTokenProgram: getSplAssociatedTokenProgramId(umi),
  }).sendAndConfirm(umi);

  // Use poolTokenAccount as vault for other operations
  const vault = poolTokenAccount;

  // Create staker's token account and mint tokens
  const stakerTokenAccount = findAssociatedTokenPda(umi, {
    mint: mint.publicKey,
    owner: staker.publicKey,
  });

  await createAssociatedToken(umi, {
    mint: mint.publicKey,
    owner: staker.publicKey,
  }).sendAndConfirm(umi);

  await mintTokensTo(umi, {
    mint: mint.publicKey,
    token: stakerTokenAccount,
    amount: 1000,
  }).sendAndConfirm(umi);

  // Derive stake account PDA
  const stakeAccount = findStakeAccountPda(umi, {
    pool: pool[0],
    staker: staker.publicKey,
  });

  // Create a stake with only 500 tokens
  await createStakeV1(umi, {
    pool,
    stakeAccount,
    staker,
    stakerTokenAccount,
    vault,
    stakerType: StakerType.MachineOwner,
    padding: [0, 0, 0, 0, 0, 0],
    amount: 500,
  }).sendAndConfirm(umi);

  // Derive vault authority
  const vaultAuthority = pool;

  // When we try to unstake more than staked.
  // Then we expect an error.
  await t.throwsAsync(
    unstakeV1(umi, {
      pool,
      stakeAccount,
      staker,
      stakerTokenAccount,
      vault,
      vaultAuthority,
      padding: [0, 0, 0, 0, 0, 0, 0],
      amount: 1000, // More than the 500 staked
    }).sendAndConfirm(umi)
  );
});

test('it can perform partial unstaking', async (t) => {
  // Given a Umi instance with an initialized pool and stake.
  const umi = await createUmi();
  const authority = umi.identity;
  const mint = generateSigner(umi);
  const staker = generateSigner(umi);

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
      lockupPeriod: 0,
    },
    gameCreatorConfig: {
      rewardRate: 200,
      lockupPeriod: 0,
    },
    associatedTokenProgram: getSplAssociatedTokenProgramId(umi),
  }).sendAndConfirm(umi);

  // Use poolTokenAccount as vault for other operations
  const vault = poolTokenAccount;

  // Create staker's token account and mint tokens
  const stakerTokenAccount = findAssociatedTokenPda(umi, {
    mint: mint.publicKey,
    owner: staker.publicKey,
  });

  await createAssociatedToken(umi, {
    mint: mint.publicKey,
    owner: staker.publicKey,
  }).sendAndConfirm(umi);

  await mintTokensTo(umi, {
    mint: mint.publicKey,
    token: stakerTokenAccount,
    amount: 1000,
  }).sendAndConfirm(umi);

  // Derive stake account PDA
  const stakeAccount = findStakeAccountPda(umi, {
    pool: pool[0],
    staker: staker.publicKey,
  });

  // Create a stake with 500 tokens
  await createStakeV1(umi, {
    pool,
    stakeAccount,
    staker,
    stakerTokenAccount,
    vault,
    stakerType: StakerType.MachineOwner,
    padding: [0, 0, 0, 0, 0, 0],
    amount: 500,
  }).sendAndConfirm(umi);

  // Derive vault authority
  const vaultAuthority = pool;

  // When we unstake only part of the stake (250 out of 500).
  await unstakeV1(umi, {
    pool,
    stakeAccount,
    staker,
    stakerTokenAccount,
    vault,
    vaultAuthority,
    padding: [0, 0, 0, 0, 0, 0, 0],
    amount: 250,
  }).sendAndConfirm(umi);

  // Then the partial unstake was successful.
  t.pass();
});
