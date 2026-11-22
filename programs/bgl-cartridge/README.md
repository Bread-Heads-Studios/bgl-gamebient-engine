# Bgl Cartridge

My project description

## Building

This will build the program and output a `.so` file in a non-comitted `target/deploy` directory which is used by the `config/shank.cjs` configuration file to start a new local validator with the latest changes on the program.

```sh
cargo build-bpf
```

## Testing

You may run the following command to build the program and run its Rust tests.

```sh
cargo test-bpf
```

## Looks

Looks are cosmetic packs for a game, sold per cartridge. Design: `docs/plans/2026-11-21-onchain-looks-program-design.md` in the ColecoVision GX workspace.

- **Look product:** a Core collection at PDA `["look", game, creator, look_id]` (look id `[a-z0-9-]{1,32}`), its own update authority, with `LookData` (v1, 147 bytes) in a LinkedAppData: game, creator, price type, price, payment mint, content hash, look version, schema, and two revenue-share fields that must be 0.
- `registerLookV1` (creator + payer sign): permissionless. The game must re-derive as a game PDA. Creates the collection and writes `LookData` (`look_version` 1).
- `updateLookV1` (creator signs): new URI, content hash and/or price; bumps `look_version`. Copies follow the latest version.
- `printLookV1` (cartridge owner + payer sign): checks the cartridge is a Core asset in the look's game owned by the signer, takes payment (transfer to the creator, or CRUMBS burn) only if `price <= max_price` (else `LookPriceChanged`), and mints a frozen Edition copy owned by the cartridge's mpl-core asset signer (`["mpl-core-execute", cartridge]`).
- **Verifying a copy** (JS client): use `isLookCopyFor(umi, { asset, cartridge, game, creator, lookId })` with the creator and id from a trusted catalog. It requires mpl-core ownership of the copy, look collection and cartridge, the copy's collection at the look PDA, matching `LookData`, the copy owned by the cartridge's asset signer, and the cartridge in the game. Read the look's URI and data from the collection, not the copy.
