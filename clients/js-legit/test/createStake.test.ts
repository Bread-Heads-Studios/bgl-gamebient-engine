import { generateSigner } from '@metaplex-foundation/umi';
import test from 'ava';
import {
  createAssociatedToken,
  createMint,
  findAssociatedTokenPda,
  getSplAssociatedTokenProgramId,
  mintTokensTo,
} from '@metaplex-foundation/mpl-toolbox';
import {
  initializePoolV1,
  findPoolPda,
  createStakeV1,
  findStakeAccountPda,
  StakerType,
} from '../src';
import { createUmi } from './_setup';

test('it can create a stake as MachineOwner', async (t) => {
  // Given a Umi instance with an initialized pool.
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
      lockupPeriod: 86400,
    },
    gameCreatorConfig: {
      rewardRate: 200,
      lockupPeriod: 172800,
    },
    associatedTokenProgram: getSplAssociatedTokenProgramId(umi),
  }).sendAndConfirm(umi);

  // Create staker's token account and mint some tokens
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

  // When we create a stake as MachineOwner.
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

  // Then the stake was created successfully.
  t.pass();
});

test('it can create a stake as GameCreator', async (t) => {
  // Given a Umi instance with an initialized pool.
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
      lockupPeriod: 86400,
    },
    gameCreatorConfig: {
      rewardRate: 200,
      lockupPeriod: 172800,
    },
    associatedTokenProgram: getSplAssociatedTokenProgramId(umi),
  }).sendAndConfirm(umi);

  // Create staker's token account and mint some tokens
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

  // When we create a stake as GameCreator.
  await createStakeV1(umi, {
    pool,
    stakeAccount,
    staker,
    stakerTokenAccount,
    vault,
    stakerType: StakerType.GameCreator,
    padding: [0, 0, 0, 0, 0, 0],
    amount: 500,
  }).sendAndConfirm(umi);

  // Then the stake was created successfully.
  t.pass();
});

test('it cannot create a stake with insufficient balance', async (t) => {
  // Given a Umi instance with an initialized pool.
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
      lockupPeriod: 86400,
    },
    gameCreatorConfig: {
      rewardRate: 200,
      lockupPeriod: 172800,
    },
    associatedTokenProgram: getSplAssociatedTokenProgramId(umi),
  }).sendAndConfirm(umi);

  // Create staker's token account with only 100 tokens
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
    amount: 100,
  }).sendAndConfirm(umi);

  // Derive stake account PDA
  const stakeAccount = findStakeAccountPda(umi, {
    pool: pool[0],
    staker: staker.publicKey,
  });

  // Derive vault (pool's ATA)
  const vault = findAssociatedTokenPda(umi, {
    mint: mint.publicKey,
    owner: pool[0],
  });

  // When we try to create a stake with more tokens than available.
  // Then we expect an error.
  await t.throwsAsync(
    createStakeV1(umi, {
      pool,
      stakeAccount,
      staker,
      stakerTokenAccount,
      vault,
      stakerType: StakerType.MachineOwner,
      padding: [0, 0, 0, 0, 0, 0],
      amount: 500, // More than the 100 available
    }).sendAndConfirm(umi)
  );
});
