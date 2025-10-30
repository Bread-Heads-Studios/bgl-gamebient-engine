# BGL Ghost Program

A Solana program for creating and managing "ghosts" (high scores and play recordings) for USG games with asynchronous multiplayer capabilities.

## Overview

The BGL Ghost program enables:

- **Ghost Creation**: Mint Metaplex Core NFTs representing player high scores and gameplay recordings
- **Ghost Usage**: Use ghosts in asynchronous multiplayer, with optional payouts to ghost owners
- **Ghost Expiration**: Burn ghosts that are no longer valid or have expired

## Program ID

```
GHoSTpSurgVaWBYJXnDZgiMMdKsWxjWmCvtVqE23JiS3
```

## Instructions

### CreateGhostV1

Creates a ghost NFT representing a high score or gameplay recording.

**Accounts:**

- `ghost` - The new ghost asset account (PDA, writable)
- `ghost_collection` - Optional Core collection for organizing ghosts
- `owner` - The player who owns the ghost
- `payer` - Account paying for storage fees (signer, writable)
- `authority` - Optional authority for creation (signer)
- `mpl_core_program` - Metaplex Core program
- `system_program` - System program

**Args:**

- `name: String` - Ghost name (max 32 characters)
- `uri: String` - Metadata URI

**TODO:** Additional fields needed:

- Game ID reference
- Score/play data
- Expiration timestamp
- Payout configuration

### UseGhostV1

Uses a ghost in asynchronous multiplayer gameplay. May trigger a payout to the ghost owner.

**Accounts:**

- `ghost` - The ghost asset being used (writable)
- `ghost_owner` - The ghost owner receiving payout (writable)
- `player` - The player using the ghost (signer, writable)
- `mpl_core_program` - Metaplex Core program
- `system_program` - System program

**TODO:** Define args and payout logic

### ExpireGhostV1

Burns a ghost NFT that is no longer valid or has expired.

**Accounts:**

- `ghost` - The ghost asset to burn (writable)
- `ghost_collection` - Optional ghost collection (writable)
- `authority` - Authority that can expire the ghost (signer, writable)
- `mpl_core_program` - Metaplex Core program
- `system_program` - System program

**TODO:** Define expiration criteria and authorization logic

## Development Status

⚠️ **This program is currently stubbed out and not production-ready.**

Key areas that need implementation:

1. Ghost data structure definition (score, replay data, expiration, etc.)
2. PDA seed derivation strategy (likely needs game_id + owner + name)
3. Payout mechanism for ghost usage
4. Expiration validation and authorization
5. Integration with game validation logic
6. AppData plugin usage for storing ghost metadata

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
  - `create_ghost.rs` - Ghost creation logic
  - `use_ghost.rs` - Ghost usage and payout logic
  - `expire_ghost.rs` - Ghost expiration/burn logic
- `src/state.rs` - State structures and constants
- `src/error.rs` - Custom error types
