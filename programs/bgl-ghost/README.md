# BGL Ghost Program

A Solana program for onchain high scores for USG games.

It currently implements **crowns**: a single high-score NFT per game season that moves to whoever beats the score, carrying a pot of winnings with it. Ghosts (replays for asynchronous multiplayer) will be added here when needed.

## Program ID

```
GHoSTpSurgVaWBYJXnDZgiMMdKsWxjWmCvtVqE23JiS3
```

## Crowns

A crown is one Core asset per `(authority, game, season)` that always belongs to the current high scorer.

- The asset is permanently frozen and the crown PDA is its permanent transfer delegate, so holders can't sell, transfer or burn it; only `ClaimCrownV1` moves it.
- Scores are trusted because the backend `attestor` (which already verifies plays) must co-sign every `ClaimCrownV1`. A score must strictly beat the current one, so a resubmitted transaction can't win twice.
- Rewards are paid from the crown's **vault** (ATA of the crown PDA, funded with a plain token transfer) into the **pot**, a token account owned by the crown asset's signer PDA (`["mpl-core-execute", asset]` under mpl-core). The pot belongs to the asset, so it moves with the crown.
- The holder cashes out at any time with mpl-core `Execute` (a token transfer signed by the asset signer). Whatever they leave in the pot "rides" and goes to whoever takes the crown from them.

Rewards (`CrownConfig`):

- `capture_bounty` - paid into the pot when the crown changes hands (not when a holder beats their own score)
- `accrual_rate` - paid into the pot per second while the crown is held
- `pot_cap` - the pot is never filled above this balance (0 = no cap); accrual above it is forfeited
- `daily_payout_cap` - maximum paid out of the vault per 24h window (0 = no cap); bounds the damage of a leaked attestor key

### CreateCrownV1

Creates the crown PDA (`["crown", authority, game, season_u32_le]`), the frozen crown asset (`["crown_asset", crown]`, starts owned by the crown PDA, with `season` and `high_score` attributes), the vault and the pot ATA.

**Args:** `name`, `uri`, `season: u32`, `min_score: u64` (score to beat for the first claim), `config: CrownConfig`

### ClaimCrownV1

Co-signed by the attestor. Pays accrual owed to the outgoing holder into the pot, moves the asset to `new_holder` if they aren't already holding it, pays the capture bounty, and updates the high score (on the account and the asset's attributes).

**Args:** `score: u64`

### AccrueCrownV1

Permissionless. Pays the time-held reward owed so far into the pot. Bundle it before an `Execute` cash-out to collect everything.

### UpdateCrownV1

Authority only. Rotates the attestor and/or replaces the `CrownConfig`, paying accrual owed under the old settings first.

### EndCrownSeasonV1

Authority only. Pays the final accrual into the pot, sends the remaining vault balance to `destination` and stops further claims. The final holder keeps the crown and its pot.

### ReassignCrownV1

Authority only. The override for a score later found to be fraudulent (scores are only checked against the stored high score, so without this a voided score would block the crown for the rest of the season). Pays accrual owed so far into the pot, moves the asset and its pot to `new_holder` (pass the crown PDA to leave the crown unclaimed), and sets the score to beat, which may be lower than the current one. No capture bounty is paid. It also works after `EndCrownSeasonV1`, so a fraudulent final holder doesn't keep the trophy.

Anything the outgoing holder already cashed out with `Execute` can't be recovered; `daily_payout_cap` bounds how much that can be. `held_since` restarts at the time of the reassignment.

**Args:** `high_score: u64`

### Pot accounts

Any token account of the reward mint owned by the asset signer is accepted as the pot, as long as it has no delegate and no close authority. A holder can tamper with the canonical pot ATA through `Execute` (close it, approve a delegate), so if the ATA is rejected, create a fresh token account owned by the asset signer and pass that instead.

## Building

```bash
# Build the program
pnpm programs:build

# Run tests
pnpm programs:test

# Generate IDL and clients
pnpm generate
```

## Architecture

The program follows the same structure as `bgl-cartridge`:

- `src/lib.rs` - Program ID declaration and module exports
- `src/entrypoint.rs` - Program entry point
- `src/instruction.rs` - Instruction definitions using Shank
- `src/processor/` - Instruction handlers
  - `mod.rs` - Instruction routing
  - `create_crown.rs`, `claim_crown.rs`, `accrue_crown.rs`, `update_crown.rs`, `end_crown_season.rs`, `reassign_crown.rs` - Crown instructions
  - `crown_utils.rs` - Shared crown validation and payout helpers
- `src/state/` - State structures and constants (`crown.rs` holds the `Crown` account)
- `src/error.rs` - Custom error types
