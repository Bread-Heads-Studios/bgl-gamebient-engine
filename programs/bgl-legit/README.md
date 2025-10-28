# BGL Legit

A staking program for the BGL (Gamebient) ecosystem that enables token-based incentives for ecosystem participants.

## Overview

BGL Legit is a Solana program that implements a multi-tier staking system with configurable reward rates and lockup periods for different participant types in the BGL gaming ecosystem.

## Staker Types

The program supports three distinct staker types, each with their own reward rates and lockup configurations:

- **Machine Owners** - Users who own and operate machine NFTs
- **Game Creators** - Developers who create and release games
- **Ghost Owners** - Users who own ghost NFTs (future implementation)

## Instructions

### InitializePool
Creates a new staking pool with configurable parameters for each staker type.

**Accounts:**
- Pool (PDA)
- Token mint
- Vault (associated token account)
- Authority
- Payer
- Token programs

**Parameters:**
- Machine owner configuration (reward rate, lockup period)
- Game creator configuration (reward rate, lockup period)
- Ghost owner configuration (reward rate, lockup period)

### CreateStake
Stakes tokens into the pool as a specific staker type.

### Unstake
Withdraws staked tokens from the pool (respects lockup periods).

### ClaimRewards
Claims accumulated staking rewards for a stake account.

### UpdatePool
Admin instruction to update pool configuration including reward rates and lockup periods.

### Slash
Admin instruction to slash tokens from a stake account (for violations or governance decisions).

## Building

Build the program and output a `.so` file to `target/deploy`:

```sh
cargo build-bpf
```

Or using the workspace command:

```sh
pnpm programs:build
```

## Testing

Run the program's Rust tests:

```sh
cargo test-bpf
```

Or using the workspace command:

```sh
pnpm programs:test
```

## Program ID

**Note:** This program is currently using a placeholder program ID. After deployment, the program ID will be updated.

```
11111111111111111111111111111111
```

## Architecture

The program uses Program Derived Addresses (PDAs) for deterministic account addresses:

- **Pool PDA**: `["pool", authority, mint]`
- **Stake PDA**: TBD

Token vaults are implemented using SPL Associated Token Accounts for secure custody of staked tokens and rewards.
