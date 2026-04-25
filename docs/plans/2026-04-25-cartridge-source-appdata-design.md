# Per-Cartridge Source AppData (AML Due Diligence)

## Background

For AML due diligence, the team needs to know whether each minted game cartridge was paid for with a crypto wallet or with fiat (Stripe). Today, `print_game_cartridge` mints a Core asset with no record of the payment source. We want to:

1. Extend `print_game_cartridge` to accept a `source` argument.
2. Persist that source per-asset using a second `AppData` external plugin on the cartridge.
3. Avoid touching cartridges already minted on mainnet — they remain valid as-is, with "no AppData present" interpreted by off-chain readers as `Source::Unknown`.

The instruction is breaking by design; all clients must redeploy with the regenerated SDK.

## Data Model (`programs/bgl-cartridge/src/state.rs`)

A new versioned struct and a new enum sit alongside the existing `GameCollectionData` / `PriceType` pair:

```rust
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Eq, Debug, Copy, Clone, ShankType)]
pub struct CartridgeData {
    pub version: u8,
    #[idl_type(Source)]
    pub source: u8,
}

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Eq, Debug, Copy, Clone, ShankType)]
pub enum Source {
    Unknown, // 0 — sentinel for off-chain readers; never written on-chain
    Crypto,  // 1
    Stripe,  // 2
}

impl From<u8> for Source {
    fn from(value: u8) -> Self {
        match value {
            0 => Source::Unknown,
            1 => Source::Crypto,
            2 => Source::Stripe,
            _ => panic!("Invalid source"),
        }
    }
}
```

Rationale:

- `version: u8 = 0` mirrors `GameCollectionData` so future AML fields (e.g. `kyc_ref`) can be added without breaking readers.
- The `Source` enum is exposed in the IDL for typed clients while the on-chain field stays a `u8` for stable Pod layout — same pattern as `PriceType`.
- `Unknown` exists for off-chain readers handling pre-upgrade cartridges that have no `AppData` plugin at all. It is **not** a legal instruction argument.

## Instruction Argument & Validation

`PrintGameCartridgeV1Args` gains a `source` byte:

```rust
#[repr(C)]
#[derive(Pod, Zeroable, PartialEq, Eq, Debug, Copy, Clone, ShankType)]
pub struct PrintGameCartridgeV1Args {
    #[skip]
    discriminator: u8,
    collection_nonce: u8,
    collection_bump: u8,
    #[idl_type(Source)]
    source: u8,
}
```

Four `u8` fields → 4 bytes total, no padding holes, `Pod`-safe. A `core::mem::size_of` sanity check during implementation will confirm.

A new error variant in `error.rs`:

```rust
#[error("Source must be specified (Unknown is not a valid argument)")]
InvalidSource,
```

Validation runs immediately after `from_bytes` in the processor:

```rust
if args.source == Source::Unknown as u8 {
    return Err(BglCartridgeError::InvalidSource.into());
}
if args.source > Source::Stripe as u8 {
    return Err(BglCartridgeError::InvalidSource.into());
}
```

The explicit upper-bound check guards against future enum drift where a stale client encodes a value the program does not yet recognize.

## Processor Changes (`print_game_cartridge.rs`)

### Register the AppData plugin during `CreateV2Cpi`

Add an `AppData` entry to the `external_plugin_adapters` list (which is currently `None`):

```rust
external_plugin_adapters: Some(vec![ExternalPluginAdapterInitInfo::AppData(
    AppDataInitInfo {
        data_authority: PluginAuthority::UpdateAuthority,
        init_plugin_authority: Some(PluginAuthority::UpdateAuthority),
        schema: None, // Borsh, matches existing GameCollectionData precedent
    },
)]),
```

`UpdateAuthority` resolves to the asset's update authority — which is the game collection PDA (already passed as `authority` to `CreateV2Cpi`). That PDA signs all subsequent writes.

### Write the source value right after create

Signed with the same seeds already used for the create CPI:

```rust
let cartridge_data = CartridgeData {
    version: 0,
    source: args.source,
};

WriteExternalPluginAdapterDataV1Cpi {
    __program: ctx.accounts.mpl_core_program,
    asset: ctx.accounts.cartridge,
    collection: Some(ctx.accounts.game),
    payer: ctx.accounts.payer,
    authority: Some(ctx.accounts.game),
    buffer: None,
    system_program: ctx.accounts.system_program,
    log_wrapper: None,
    __args: WriteExternalPluginAdapterDataV1InstructionArgs {
        key: ExternalPluginAdapterKey::AppData(PluginAuthority::UpdateAuthority),
        data: Some(borsh::to_vec(&cartridge_data)?),
    },
}
.invoke_signed(&[&[
    GAME_PREFIX,
    collection.name.as_bytes(),
    &[args.collection_nonce],
    &[args.collection_bump],
]])?;
```

### Accounts

`PrintGameCartridgeV1Accounts` is unchanged. The write CPI needs `asset`, `collection`, `payer`, `system_program`, and `mpl_core_program` — all already present. The data authority signer is the game PDA, satisfied via `invoke_signed`.

### Compute budget

One extra CPI plus a 2-byte Borsh serialization. Comfortably within the instruction's existing headroom; no budget change anticipated.

## Tests

JS client tests (`clients/js-cartridge/test/printGameCartridge.test.ts`):

1. Update the existing happy-path test to pass `source: Source.Crypto` and assert the asset's `appDatas` plugin contains `{ version: 0, source: Source.Crypto }`.
2. Add a second test that mints a `Source.Stripe` cartridge in the same game and asserts the per-asset values are independent.
3. Add a negative test: `source: Source.Unknown` must fail with `InvalidSource`.

Rust client tests (`clients/rust-cartridge`) get a parallel happy-path update; the negative case stays JS-only.

## Client Regeneration

After the program changes compile, run `pnpm generate`. Kinobi will:

- Regenerate `printGameCartridgeV1` with a required `source: Source` argument.
- Emit `Source` enum + `CartridgeData` codec in both JS and Rust clients.

## Rollout & Compatibility

- **Existing mainnet cartridges** have no `AppData` plugin and remain valid. Off-chain readers must treat "AppData missing" as `Source::Unknown` rather than calling the on-chain fetch helper unguarded.
- **Instruction is breaking** (extra required arg). Callers must adopt the regenerated client before the upgraded program ships. Standard breaking-change choreography — coordinate program upgrade and client release.
- **No on-chain migration** is needed because this only affects new mints.

## Out of Scope (flagged for later)

- An admin "set source" instruction for correcting misclassifications.
- Backfilling `AppData` onto pre-upgrade cartridges via a one-shot ix.
