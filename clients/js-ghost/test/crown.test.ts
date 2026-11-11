/* eslint-disable import/no-extraneous-dependencies */
import {
  createNoopSigner,
  generateSigner,
  PublicKey,
  Signer,
  Umi,
} from '@metaplex-foundation/umi';
import {
  approveTokenDelegate,
  createMint,
  createToken,
  fetchToken,
  findAssociatedTokenPda,
  mintTokensTo,
  transferTokens,
} from '@metaplex-foundation/mpl-toolbox';
import {
  execute,
  fetchAsset,
  findAssetSignerPda,
} from '@metaplex-foundation/mpl-core';
import test from 'ava';
import {
  accrueCrownV1,
  claimCrownV1,
  createCrownV1,
  CrownConfigArgs,
  endCrownSeasonV1,
  fetchCrown,
  findCrownAssetPda,
  findCrownPda,
  updateCrownV1,
} from '../src';
import { createUmi } from './_setup';

const VAULT_FUNDING = 1_000_000n;

type CrownSetup = {
  crown: PublicKey;
  asset: PublicKey;
  assetSigner: PublicKey;
  mint: PublicKey;
  vault: PublicKey;
  pot: PublicKey;
  attestor: Signer;
  authority: Signer;
};

const DEFAULT_CONFIG: CrownConfigArgs = {
  captureBounty: 100,
  accrualRate: 0,
  potCap: 0,
  dailyPayoutCap: 0,
};

async function setupCrown(
  umi: Umi,
  {
    config = DEFAULT_CONFIG,
    minScore = 0,
  }: { config?: CrownConfigArgs; minScore?: number } = {}
): Promise<CrownSetup> {
  const authority = umi.identity;
  const attestor = generateSigner(umi);
  const game = generateSigner(umi).publicKey;
  const mint = generateSigner(umi);

  await createMint(umi, { mint }).sendAndConfirm(umi);

  const [crown] = findCrownPda(umi, {
    authority: authority.publicKey,
    game,
    season: 1,
  });
  const [asset] = findCrownAssetPda(umi, { crown });
  const [assetSigner] = findAssetSignerPda(umi, { asset });
  const [vault] = findAssociatedTokenPda(umi, {
    mint: mint.publicKey,
    owner: crown,
  });
  const [pot] = findAssociatedTokenPda(umi, {
    mint: mint.publicKey,
    owner: assetSigner,
  });

  await createCrownV1(umi, {
    crown,
    asset,
    assetSigner,
    game,
    rewardMint: mint.publicKey,
    vault,
    pot,
    authority,
    attestor: attestor.publicKey,
    name: 'Crown',
    uri: 'https://example.com/crown.json',
    season: 1,
    minScore,
    config,
  })
    .add(
      mintTokensTo(umi, {
        mint: mint.publicKey,
        token: vault,
        amount: VAULT_FUNDING,
      })
    )
    .sendAndConfirm(umi);

  return {
    crown,
    asset,
    assetSigner,
    mint: mint.publicKey,
    vault,
    pot,
    attestor,
    authority,
  };
}

function claim(
  umi: Umi,
  s: CrownSetup,
  player: PublicKey,
  score: number,
  { attestor = s.attestor, pot = s.pot } = {}
) {
  return claimCrownV1(umi, {
    crown: s.crown,
    asset: s.asset,
    newHolder: player,
    vault: s.vault,
    pot,
    attestor,
    score,
  }).sendAndConfirm(umi);
}

const balance = async (umi: Umi, token: PublicKey) =>
  (await fetchToken(umi, token)).amount;

const attribute = async (umi: Umi, asset: PublicKey, key: string) =>
  (await fetchAsset(umi, asset)).attributes?.attributeList.find(
    (a) => a.key === key
  )?.value;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

test('it can create a crown', async (t) => {
  const umi = await createUmi();
  const s = await setupCrown(umi, { minScore: 50 });

  const crown = await fetchCrown(umi, s.crown);
  t.like(crown, {
    authority: s.authority.publicKey,
    attestor: s.attestor.publicKey,
    asset: s.asset,
    rewardMint: s.mint,
    highScore: 50n,
    season: 1,
    isActive: 1,
  });

  const asset = await fetchAsset(umi, s.asset);
  t.is(asset.owner, s.crown);
  t.true(asset.permanentFreezeDelegate?.frozen);
  t.truthy(asset.permanentTransferDelegate);
  t.is(await attribute(umi, s.asset, 'high_score'), '50');
  t.is(await balance(umi, s.vault), VAULT_FUNDING);
  t.is(await balance(umi, s.pot), 0n);
});

test('a verified high score takes the crown and pays the bounty into the pot', async (t) => {
  const umi = await createUmi();
  const s = await setupCrown(umi);
  const player = generateSigner(umi).publicKey;

  await claim(umi, s, player, 1000);

  t.is((await fetchAsset(umi, s.asset)).owner, player);
  t.like(await fetchCrown(umi, s.crown), {
    holder: player,
    highScore: 1000n,
  });
  t.is(await attribute(umi, s.asset, 'high_score'), '1000');
  t.is(await balance(umi, s.pot), 100n);
  t.is(await balance(umi, s.vault), VAULT_FUNDING - 100n);
});

test('it rejects scores that are not higher, unsigned or from the wrong attestor', async (t) => {
  const umi = await createUmi();
  const s = await setupCrown(umi, { minScore: 500 });
  const player = generateSigner(umi).publicKey;

  // Not above the minimum score.
  await t.throwsAsync(claim(umi, s, player, 500), {
    message: /Score does not beat/,
  });

  // Wrong attestor.
  await t.throwsAsync(
    claim(umi, s, player, 1000, { attestor: generateSigner(umi) }),
    { message: /Invalid Attestor/ }
  );

  // Attestor didn't sign.
  await t.throwsAsync(
    claim(umi, s, player, 1000, {
      attestor: createNoopSigner(s.attestor.publicKey),
    })
  );

  t.is((await fetchAsset(umi, s.asset)).owner, s.crown);
});

test('the pot rides with the crown to the next holder', async (t) => {
  const umi = await createUmi();
  const s = await setupCrown(umi);
  const first = generateSigner(umi).publicKey;
  const second = generateSigner(umi).publicKey;

  await claim(umi, s, first, 1000);
  await claim(umi, s, second, 2000);

  t.is((await fetchAsset(umi, s.asset)).owner, second);
  t.true((await fetchAsset(umi, s.asset)).permanentFreezeDelegate?.frozen);
  t.is(await balance(umi, s.pot), 200n);
});

test('a holder beating their own score pays no bounty', async (t) => {
  const umi = await createUmi();
  const s = await setupCrown(umi);
  const player = generateSigner(umi).publicKey;

  await claim(umi, s, player, 1000);
  await claim(umi, s, player, 1001);

  t.is((await fetchAsset(umi, s.asset)).owner, player);
  t.is((await fetchCrown(umi, s.crown)).highScore, 1001n);
  t.is(await balance(umi, s.pot), 100n);
});

test('the holder can cash out the pot with Core Execute', async (t) => {
  const umi = await createUmi();
  const s = await setupCrown(umi);
  const player = generateSigner(umi);

  await claim(umi, s, player.publicKey, 1000);

  const destination = generateSigner(umi);
  await createToken(umi, {
    token: destination,
    mint: s.mint,
    owner: player.publicKey,
  }).sendAndConfirm(umi);

  await execute(umi, {
    asset: await fetchAsset(umi, s.asset),
    authority: player,
    instructions: transferTokens(umi, {
      source: s.pot,
      destination: destination.publicKey,
      authority: createNoopSigner(s.assetSigner),
      amount: 100,
    }),
  }).sendAndConfirm(umi);

  t.is(await balance(umi, destination.publicKey), 100n);
  t.is(await balance(umi, s.pot), 0n);
});

test('time held accrues into the pot', async (t) => {
  const umi = await createUmi();
  const s = await setupCrown(umi, {
    config: { ...DEFAULT_CONFIG, captureBounty: 0, accrualRate: 10 },
  });
  const player = generateSigner(umi).publicKey;

  await claim(umi, s, player, 1000);
  t.is(await balance(umi, s.pot), 0n);

  await sleep(3000);
  await accrueCrownV1(umi, {
    crown: s.crown,
    vault: s.vault,
    pot: s.pot,
  }).sendAndConfirm(umi);

  const pot = await balance(umi, s.pot);
  t.true(pot > 0n, `pot was ${pot}`);
  t.is(pot % 10n, 0n);
});

test('payouts respect the pot cap and the daily payout cap', async (t) => {
  const umi = await createUmi();

  const capped = await setupCrown(umi, {
    config: { ...DEFAULT_CONFIG, potCap: 150 },
  });
  await claim(umi, capped, generateSigner(umi).publicKey, 1);
  await claim(umi, capped, generateSigner(umi).publicKey, 2);
  t.is(await balance(umi, capped.pot), 150n);

  const daily = await setupCrown(umi, {
    config: { ...DEFAULT_CONFIG, dailyPayoutCap: 250 },
  });
  await claim(umi, daily, generateSigner(umi).publicKey, 1);
  await claim(umi, daily, generateSigner(umi).publicKey, 2);
  await claim(umi, daily, generateSigner(umi).publicKey, 3);
  t.is(await balance(umi, daily.pot), 250n);
});

test('a pot with a delegate is rejected but a clean pot account works', async (t) => {
  const umi = await createUmi();
  const s = await setupCrown(umi);
  const holder = generateSigner(umi);

  await claim(umi, s, holder.publicKey, 1000);

  // The holder approves themselves as a delegate on the pot before losing it.
  await execute(umi, {
    asset: await fetchAsset(umi, s.asset),
    authority: holder,
    instructions: approveTokenDelegate(umi, {
      source: s.pot,
      delegate: holder.publicKey,
      owner: createNoopSigner(s.assetSigner),
      amount: 1_000_000,
    }),
  }).sendAndConfirm(umi);

  const challenger = generateSigner(umi).publicKey;
  await t.throwsAsync(claim(umi, s, challenger, 2000), {
    message: /Invalid Pot Account/,
  });

  // A fresh token account owned by the asset signer works instead.
  const cleanPot = generateSigner(umi);
  await createToken(umi, {
    token: cleanPot,
    mint: s.mint,
    owner: s.assetSigner,
  }).sendAndConfirm(umi);
  await claim(umi, s, challenger, 2000, { pot: cleanPot.publicKey });

  t.is((await fetchAsset(umi, s.asset)).owner, challenger);
  t.is(await balance(umi, cleanPot.publicKey), 100n);
});

test('the authority can rotate the attestor', async (t) => {
  const umi = await createUmi();
  const s = await setupCrown(umi);
  const newAttestor = generateSigner(umi);

  // Someone else can't update it.
  await t.throwsAsync(
    updateCrownV1(umi, {
      crown: s.crown,
      authority: generateSigner(umi),
      vault: s.vault,
      pot: s.pot,
      attestor: newAttestor.publicKey,
      config: DEFAULT_CONFIG,
    }).sendAndConfirm(umi),
    { message: /Invalid Authority/ }
  );

  await updateCrownV1(umi, {
    crown: s.crown,
    authority: s.authority,
    vault: s.vault,
    pot: s.pot,
    attestor: newAttestor.publicKey,
    config: DEFAULT_CONFIG,
  }).sendAndConfirm(umi);

  const player = generateSigner(umi).publicKey;
  await t.throwsAsync(claim(umi, s, player, 1000), {
    message: /Invalid Attestor/,
  });
  await claim(umi, s, player, 1000, { attestor: newAttestor });
  t.is((await fetchAsset(umi, s.asset)).owner, player);
});

test('ending the season returns the vault and freezes the crown with its holder', async (t) => {
  const umi = await createUmi();
  const s = await setupCrown(umi);
  const player = generateSigner(umi).publicKey;
  await claim(umi, s, player, 1000);

  const destination = generateSigner(umi);
  await createToken(umi, {
    token: destination,
    mint: s.mint,
    owner: s.authority.publicKey,
  }).sendAndConfirm(umi);

  await endCrownSeasonV1(umi, {
    crown: s.crown,
    authority: s.authority,
    vault: s.vault,
    pot: s.pot,
    destination: destination.publicKey,
  }).sendAndConfirm(umi);

  t.is((await fetchCrown(umi, s.crown)).isActive, 0);
  t.is(await balance(umi, s.vault), 0n);
  t.is(await balance(umi, destination.publicKey), VAULT_FUNDING - 100n);
  t.is(await balance(umi, s.pot), 100n);

  await t.throwsAsync(claim(umi, s, generateSigner(umi).publicKey, 5000), {
    message: /Crown season has ended/,
  });
  t.is((await fetchAsset(umi, s.asset)).owner, player);
});
