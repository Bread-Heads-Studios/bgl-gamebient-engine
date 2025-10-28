# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Building and Testing Programs
```bash
# Build all Solana programs
pnpm programs:build

# Run program tests (without logs)
pnpm programs:test

# Run program tests with debug logs
pnpm programs:debug

# Clean built programs
pnpm programs:clean

# Format Rust code
cargo fmt

# Check Rust code for linting issues
cargo clippy
```

### Client Development
```bash
# Generate IDLs and clients from program code
pnpm generate

# Test JavaScript client
pnpm clients:js:test

# Test Rust client
pnpm clients:rust:test

# Lint JavaScript/TypeScript code
pnpm lint

# Fix linting and formatting issues
pnpm lint:fix
```

### Local Validator
```bash
# Start local validator (with Amman)
pnpm validator

# Start validator with debug logs
pnpm validator:debug

# View validator logs
pnpm validator:logs

# Stop validator
pnpm validator:stop
```

## Architecture Overview

### Solana Program Structure
The main Solana program is located at `programs/bgl-cartridge/` and follows a modular architecture:

- **Entry Point**: `src/entrypoint.rs` - Processes incoming transactions
- **Instructions**: `src/instruction.rs` - Defines program instructions using Shank macros for IDL generation
- **Processor**: `src/processor/` - Contains instruction handlers, organized by feature:
  - `mod.rs` - Routes instructions to appropriate handlers
  - `create_machine.rs` - Implementation for creating machine NFTs
- **State**: `src/state.rs` - Defines on-chain data structures
- **Error**: `src/error.rs` - Custom error types for the program

### Key Dependencies
- **mpl-core**: Metaplex Core NFT standard for creating and managing NFTs
- **shank**: Generates IDLs from Rust code annotations for client generation
- **solana-program**: Core Solana runtime SDK

### Client Generation Pipeline
1. Shank extracts instruction definitions from Rust code (`configs/shank.cjs`)
2. Kinobi generates TypeScript and Rust clients from IDLs (`configs/kinobi.cjs`)
3. Clients are output to `clients/js/` and `clients/rust/`

### Program ID
The program is deployed at: `CART9hmcuf38a58NCYhRJmtGXJjh16eXmLr9hmhAqPZo`

### Development Workflow
1. Modify program code in `programs/bgl-cartridge/src/`
2. Run `pnpm programs:build` to compile
3. Run `pnpm programs:test` to verify changes
4. Run `pnpm generate` to update clients after instruction changes
5. Test clients with `pnpm clients:js:test` or `pnpm clients:rust:test`