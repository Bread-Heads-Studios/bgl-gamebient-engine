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
  slashV1,
  StakerType,
} from '../src';
import { createUmi } from './_setup';

test('it can slash a stake as authority', async (t) => {
  // Given a Umi instance with an initialized pool and stake.
  const umi = await createUmi();
  const authority = umi.identity;
  const mint = generateSigner(umi);
  const staker = generateSigner(umi);
  const slashDestination = generateSigner(umi);

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

  // Use vault for other operations
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

  // Create slash destination token account
  const slashDestinationTokenAccount = findAssociatedTokenPda(umi, {
    mint: mint.publicKey,
    owner: slashDestination.publicKey,
  });

  await createAssociatedToken(umi, {
    mint: mint.publicKey,
    owner: slashDestination.publicKey,
  }).sendAndConfirm(umi);

  // Derive vault authority (pool PDA)
  const vaultAuthority = pool;

  // When we slash the stake as authority.
  await slashV1(umi, {
    pool,
    stakeAccount,
    vault,
    slashDestination: slashDestinationTokenAccount,
    vaultAuthority,
    padding: [0, 0, 0, 0, 0, 0, 0],
    amount: 100, // Slash 100 tokens
  }).sendAndConfirm(umi);

  // Then the slash was successful.
  t.pass();
});

test('it cannot slash without authority', async (t) => {
  // Given a Umi instance with an initialized pool and stake.
  const umi = await createUmi();
  const authority = umi.identity;
  const mint = generateSigner(umi);
  const staker = generateSigner(umi);
  const slashDestination = generateSigner(umi);
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

  // Use vault for other operations
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

  // Create slash destination token account
  const slashDestinationTokenAccount = findAssociatedTokenPda(umi, {
    mint: mint.publicKey,
    owner: slashDestination.publicKey,
  });

  await createAssociatedToken(umi, {
    mint: mint.publicKey,
    owner: slashDestination.publicKey,
  }).sendAndConfirm(umi);

  // Derive vault authority
  const vaultAuthority = pool;

  // When we try to slash without proper authority.
  // Then we expect an error.
  await t.throwsAsync(
    slashV1(umi, {
      pool,
      stakeAccount,
      authority: unauthorizedUser,
      vault,
      slashDestination: slashDestinationTokenAccount,
      vaultAuthority,
      padding: [0, 0, 0, 0, 0, 0, 0],
      amount: 100,
    }).sendAndConfirm(umi)
  );
});

test('it cannot slash more than the staked amount', async (t) => {
  // Given a Umi instance with an initialized pool and stake.
  const umi = await createUmi();
  const authority = umi.identity;
  const mint = generateSigner(umi);
  const staker = generateSigner(umi);
  const slashDestination = generateSigner(umi);

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

  // Use vault for other operations
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

  // Create slash destination token account
  const slashDestinationTokenAccount = findAssociatedTokenPda(umi, {
    mint: mint.publicKey,
    owner: slashDestination.publicKey,
  });

  await createAssociatedToken(umi, {
    mint: mint.publicKey,
    owner: slashDestination.publicKey,
  }).sendAndConfirm(umi);

  // Derive vault authority
  const vaultAuthority = pool;

  // When we try to slash more than the staked amount.
  // Then we expect an error.
  await t.throwsAsync(
    slashV1(umi, {
      pool,
      stakeAccount,
      vault,
      slashDestination: slashDestinationTokenAccount,
      vaultAuthority,
      padding: [0, 0, 0, 0, 0, 0, 0],
      amount: 1000, // More than the 500 staked
    }).sendAndConfirm(umi)
  );
});
