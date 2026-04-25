# gmbnt CLI Design

## Overview
CLI for the BGL Cartridge Protocol on Solana. Flat verb-noun command style, full read/write support for the cartridge protocol.

## Commands

### Transaction Commands (require signing)
- `gmbnt commission-machine` — Create a machine NFT in a collection
- `gmbnt release-game` — Publish a new game as a collection
- `gmbnt print-cartridge` — Mint a cartridge (buy a copy of a game)
- `gmbnt insert-cartridge` — Insert a cartridge into a machine
- `gmbnt remove-cartridge` — Remove a cartridge from a machine

### Read Commands
- `gmbnt get-game <address>` — Show game details
- `gmbnt get-machine <address>` — Show machine details
- `gmbnt get-cartridge <address>` — Show cartridge details
- `gmbnt list-games` — List games published by a wallet
- `gmbnt list-machines` — List machines owned by a wallet
- `gmbnt list-cartridges` — List cartridges owned by a wallet

### Global Flags
- `--cluster <mainnet|devnet|localnet|URL>` (default: mainnet)
- `--keypair <path>` (default: ~/.config/solana/id.json)
- `--output <table|json>` (default: table)

## Tech Stack
- commander (CLI framework)
- @metaplex-foundation/umi + umi-bundle-defaults
- @metaplex-foundation/mpl-core
- @bgl/cartridge JS client
- chalk, ora, cli-table3 (UX)

## Directory Layout
```
clients/cli/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── setup.ts
│   ├── commands/
│   │   ├── commission-machine.ts
│   │   ├── release-game.ts
│   │   ├── print-cartridge.ts
│   │   ├── insert-cartridge.ts
│   │   ├── remove-cartridge.ts
│   │   ├── get-game.ts
│   │   ├── get-machine.ts
│   │   ├── get-cartridge.ts
│   │   ├── list-games.ts
│   │   ├── list-machines.ts
│   │   └── list-cartridges.ts
│   └── utils/
│       ├── display.ts
│       └── constants.ts
```

## UX
- Transaction commands: summary → spinner → success with explorer link / failure with mapped error
- Read commands: table (default) or JSON output
- Interactive prompts when required args are missing
- Program errors mapped to human-readable names from IDL error codes
- Missing keypair → point to solana-keygen
- Insufficient balance → show current vs required
