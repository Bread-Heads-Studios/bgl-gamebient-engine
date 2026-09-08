# Core Groups Enablement (Library Listings)

## Background

The ColecoVision GX website wants its game catalog to be a Metaplex Core **Group** (`GroupV1`)
whose `collections` vector holds the released game collections that belong in the library. The
website-side design lives in the website repo at
`docs/plans/2026-09-08-core-groups-library-design.md`. Its Phase 2 is blocked on this program:

> `addCollectionsToGroupV1` requires one signer that is both the group's update authority *and*
> each collection's update authority (or an `UpdateDelegate` delegate). BGL game collections are
> program-owned PDAs, so no off-chain key qualifies.

`releaseGameV1` creates the game collection with `update_authority = game PDA`
(`programs/bgl-cartridge/src/processor/release_game.rs`), and only this program can sign as that
PDA. So membership in a Core group can only ever be established through a `bgl-cartridge`
instruction. This document specifies those instructions.

The website doc asked for two properties, which this design keeps:

1. **Two-sided consent.** The publisher opts a game in; the curator (GX) decides whether it is
   listed. The publisher keeps custody and update authority of the game.
2. **No standing `UpdateDelegate` for an off-chain key.** See the delegate-scope finding below.

## Findings

Verified against the `mpl-core` Rust crate on crates.io (0.10.1 pinned here, 0.11.2, 0.12.0,
0.12.1), the `mpl-core` program source at `main`, and the `@metaplex-foundation/mpl-core` JS
package 1.10.0.

### The group instructions exist only in crate 0.12.x, which needs `solana-program` 3

| mpl-core crate | `solana-program` | `PluginType` variants | Group instructions |
|---|---|---|---|
| 0.10.1 (pinned) | `> 1.14` (resolves 2.3.0 here) | 17 | none |
| 0.11.2 | 2.2.1 | 18 | none |
| 0.12.0 / 0.12.1 | **3.0.0** | 19 (adds `Groups` = 18) | all nine |

This workspace is on `solana-program` 2.3, `mpl-utils` 0.4.1, `spl-token` 6, and CI pins
`SOLANA_VERSION=2.2.1`. Moving to 0.12.x drags `mpl-utils` 0.5 (`solana-program ^3`), `spl-token`
9, `spl-associated-token-account` 8, and `solana-program-test` 3 for `clients/rust-cartridge`,
across all three programs in the workspace. That is a toolchain migration, not a feature change,
and it is **not** required to ship this. See "Why hand-rolled CPIs" below.

### The pinned crate survives a `Groups` plugin on the collection

`addCollectionsToGroupV1` writes a `Groups` plugin (`PluginType` 18) onto every collection it adds
(`processor/groups_plugin_utils.rs`). `printGameCartridgeV1` and `setCartridgeSourceV1` both walk
the collection's plugin registry via `fetch_external_plugin_adapter_data_info`, so the question
was whether crate 0.10.1 chokes on a plugin type it does not know.

It does not. That helper goes through `PluginRegistryV1Safe` (`hooked/advanced_types.rs`), whose
`RegistryRecordSafe.plugin_type` is a raw `u8`, not the `PluginType` enum. Listed games keep
printing and keep accepting source attestations with no program change. Do **not** switch those
paths to `PluginRegistryV1::from_bytes` or to a typed `fetch_plugin` call, which would reintroduce
the failure.

The JS side is the opposite: `@metaplex-foundation/mpl-core` 1.6/1.7 decode the registry with a
`scalarEnum(PluginType)` serializer, which throws on 18. Every JS reader of a listed game's
collection (`fetchCollection`, `fetchCollectionsByUpdateAuthority`, and anything built on them)
must be on **1.10.0 or later** before the first game is listed. That covers `clients/js-cartridge`
and `clients/cli` here (both `^1.6.0`) and the website's `src/lib/metaplex.ts` and
`src/lib/gamePricing.ts` (`^1.7.0`).

### An `UpdateDelegate` on a collection can mint into it

`plugins/internal/authority_managed/update_delegate.rs` on `main`:

- `validate_create` approves when `additional_delegates` contains the signer. A delegate can
  `createV2` assets **directly into the game collection**, bypassing `printGameCartridgeV1`'s
  CRUMBS payment, the `MasterEdition` supply, and the cartridge `AppData` source record.
- `validate_update` approves collection name/URI changes.
- `validate_add_plugin` / `validate_remove_plugin` approve plugin changes, including removing the
  `PermanentTransferDelegate` and `PermanentBurnDelegate` the program installs for AML.

The website doc lists the breadth of `UpdateDelegate` as a risk and proposes a transient
grant-add-revoke. This design removes the risk differently: the delegate is a **PDA of this
program**, so the only code that can ever exercise it is `bgl-cartridge`, and `bgl-cartridge` only
exposes group-membership operations through it. No off-chain key ever holds update rights.

### The authority checks, exactly

`processor/add_collections_to_group.rs` and `remove_collections_from_group.rs` both do:

```rust
is_valid_group_authority(group, authority)          // authority == GroupV1.update_authority
for collection in remaining_accounts {
    is_valid_collection_authority(collection, authority)  // collection UA, or in UpdateDelegate.additional_delegates
}
```

`is_valid_group_authority` accepts only the group's update authority; there is no delegate on the
group side. Therefore the one signer must be a collection delegate, and it must be the group's
update authority. `createGroupV1` requires `update_authority` to **sign** (`resolve_authority`
asserts it), so a group owned by a program PDA can only be created through this program too.

### Instruction ABI needed from Core

From the 0.12.1 generated builders (stable Core discriminators):

| Instruction | Discriminator | Args (Borsh) | Accounts |
|---|---|---|---|
| `AddCollectionsToGroupV1` | 33 | none | `group` (w), `payer` (w, s), `authority` (s, optional), `system_program`, then each collection (w) as a remaining account |
| `RemoveCollectionsFromGroupV1` | 34 | none | same shape |
| `CreateGroupV1` | 39 | `name: String`, `uri: String`, `relationships: Vec<RelationshipEntry>` | `group` (w, s), `update_authority` (s, optional), `payer` (w, s), `system_program` |
| `UpdateGroupV1` | 41 | `new_name: Option<String>`, `new_uri: Option<String>` | `group` (w), `payer` (w, s), `authority` (s, optional), `new_update_authority` (optional account), `system_program` |

All four discriminators were read directly from the generated files. `RelationshipEntry` is `{ kind: RelationshipKind (u8), key: Pubkey }`; we always
pass an empty vector.

`AddCollectionPluginV1` (3), `RemoveCollectionPluginV1` (5) and the `UpdateDelegate` type are
already in crate 0.10.1 and are used through the generated `*Cpi` builders.

### Mainnet deployment of the group instructions is unverified

The test harness dumps `mpl_core.so` from mainnet (`configs/scripts/program/dump.sh`). This
session could not reach mainnet RPC. Before starting, check:

```sh
solana program dump -u m CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d /tmp/mpl_core.so
strings /tmp/mpl_core.so | grep -c GroupVectorFull   # non-zero means groups are live
```

If the count is zero, build `mpl_core.so` from the `mpl-core` repo (`programs/mpl-core`,
`cargo build-sbf`) into `programs/.bin/mpl_core.so`. `dump.sh` keeps an existing local binary and
only warns on hash mismatch, so local tests run against the newer build. The mainnet deploy then
becomes an external prerequisite for the website's Phase 2.

## Scope Decisions

| Fork | Choice |
|---|---|
| Who owns the group | A per-curator **library authority PDA**, `[b"library", curator]`. The curator wallet signs program instructions; the program signs as the PDA toward Core. |
| Who is the collection delegate | The same library authority PDA, via `UpdateDelegate { additional_delegates: [library] }`. |
| Consent model | Publisher opts in/out (signs as `GameCollectionData.publisher`); curator lists/delists. |
| Delegate lifetime | Standing, from opt-in until opt-out. Safe because only this program can use it. |
| Opt-out semantics | Delists from every group in the collection's `Groups` plugin, then removes the delegate. A publisher cannot strand a listing. |
| Libraries per game | One in v1. Opt-in fails if the collection already has an `UpdateDelegate`. |
| `releaseGameV1` | Unchanged. Opt-in is a separate instruction so the website can bundle it into the publish transaction without a breaking arg change. |
| Core CPI mechanism | Hand-rolled instruction bytes for the four group instructions; generated builders for everything else. No dependency bump. |
| Nested groups (shelves) | Deferred. The per-curator PDA can own any number of groups, so `addGroupsToGroupV1` fits later without a new PDA scheme. |

## Design

### State (`state.rs`)

```rust
pub const LIBRARY_PREFIX: &[u8] = b"library";
```

The library authority PDA holds no data and is never created as an account. It exists only to
sign CPIs. No changes to `GameCollectionData` or `CartridgeData`.

### Instructions (`instruction.rs`)

Appended after `SetCartridgeSourceV1` so existing discriminators do not move.

**`CreateLibraryV1(CreateLibraryV1Args { name, uri })`** — curator creates a group owned by their
library PDA.

| # | Account | Flags | Purpose |
|---|---|---|---|
| 0 | `library` | | PDA `[b"library", curator]`, verified |
| 1 | `group` | writable, signer | Fresh keypair, becomes the `GroupV1` |
| 2 | `curator` | signer | Owner of the library PDA |
| 3 | `payer` | writable, signer | Pays rent |
| 4 | `mpl_core_program` | | |
| 5 | `system_program` | | |

CPI `CreateGroupV1` with `update_authority = library` signed by the PDA, `relationships = []`.
Args are `String`s, so use the manual `unpack` pattern from `ReleaseGameV1Args`, and reuse its
name/URI guards (`InvalidName`, `InvalidUri`). Name is not a seed here, so allow the Core limit
rather than 32.

**`UpdateLibraryV1(UpdateLibraryV1Args { new_name: Option<String>, new_uri: Option<String> })`** —
curator renames or re-points a group. Same accounts minus `group` being a signer. CPI
`UpdateGroupV1` with the optional `new_update_authority` account omitted; the program must never
hand the group to another authority, or every listed game becomes unremovable. Cheap to include and the only way
the group's name/URI can ever change.

**`OptInLibraryV1(OptInLibraryV1Args { collection_nonce, collection_bump })`** — publisher grants
the library PDA delegate rights on their game.

| # | Account | Flags | Purpose |
|---|---|---|---|
| 0 | `game` | writable | Game collection |
| 1 | `library` | | PDA `[b"library", curator]`, verified |
| 2 | `curator` | | Not a signer; only seeds the derivation |
| 3 | `publisher` | signer | Must equal `GameCollectionData.publisher` |
| 4 | `payer` | writable, signer | Pays plugin rent |
| 5 | `mpl_core_program` | | |
| 6 | `system_program` | | |

Processor:
1. `assert_owned_by(game, mpl_core::ID)`, `BaseCollectionV1::from_bytes` for the name.
2. Read `GameCollectionData` from the `LinkedAppData` adapter exactly as
   `print_game_cartridge.rs` does; require `publisher.key == data.publisher`.
3. `fetch_collection_plugin::<UpdateDelegate>` must return `PluginNotFound`; otherwise
   `LibraryDelegateAlreadySet`.
4. `AddCollectionPluginV1Cpi { plugin: UpdateDelegate { additional_delegates: vec![*library.key] },
   init_authority: None }` with `authority = game`, `invoke_signed` with the game seeds
   (`GAME_PREFIX`, collection name, nonce, bump), the same seed set `set_cartridge_source.rs` uses.

`init_authority: None` leaves the plugin's authority as `UpdateAuthority`, the game PDA, so only
this program can later change or remove it. The plugin is Pod-args (three `u8`), same as
`SetCartridgeSourceV1Args`.

**`ListGameV1(ListGameV1Args { library_bump })`** — curator adds a game to a group.

| # | Account | Flags | Purpose |
|---|---|---|---|
| 0 | `library` | | PDA, verified with `create_program_address` against `library_bump` |
| 1 | `group` | writable | The `GroupV1` |
| 2 | `game` | writable | Game collection; Core writes its `Groups` plugin |
| 3 | `curator` | signer | |
| 4 | `payer` | writable, signer | Pays realloc on group and collection |
| 5 | `mpl_core_program` | | |
| 6 | `system_program` | | |

Processor: verify derivation and signer, then CPI `AddCollectionsToGroupV1` with
`authority = library` (PDA-signed) and `game` as the single remaining account. Core enforces that
the group's UA is the library PDA and that the collection's `UpdateDelegate` names it, and returns
`DuplicateEntry` / `GroupVectorFull` itself, so the program adds no membership checks of its own.

**`DelistGameV1(DelistGameV1Args { library_bump })`** — curator removes a game. Same accounts;
CPI `RemoveCollectionsFromGroupV1`.

**`OptOutLibraryV1(OptOutLibraryV1Args { collection_nonce, collection_bump, library_bump })`** —
publisher revokes. Accounts as `OptInLibraryV1`, plus every group the game is currently in as
writable **remaining accounts**.

Processor:
1. Publisher check as in opt-in. `fetch_collection_plugin::<UpdateDelegate>` must exist and be
   exactly `[library]`; otherwise `LibraryDelegateNotSet` (or `InvalidLibraryDelegate` if it
   names something else, which cannot happen through this program but is cheap to refuse).
2. Read the collection's `Groups` plugin. Crate 0.10.1 has no `Groups` type, so scan
   `PluginRegistryV1Safe.registry` for `plugin_type == 18` and Borsh-decode `Vec<Pubkey>` at its
   `offset` (the plugin body is exactly that vector). Put this in a small helper next to the
   group CPI code so it is replaced wholesale when the crate is bumped.
3. Require the set of remaining-account keys to equal that vector; otherwise `GameStillListed`.
   For each, CPI `RemoveCollectionsFromGroupV1` signed as the library PDA. If the vector is empty
   no groups are needed.
4. `RemoveCollectionPluginV1Cpi { plugin_type: UpdateDelegate }` with `authority = game`, signed
   with the game seeds.

Step 3 is what makes the website doc's "publisher pins their game" risk impossible: the delegate
cannot go away while a listing exists, and the removal happens under the same signature that
removes the delegate. Note the ordering: delist first, while the delegate still satisfies Core's
collection-side check.

### Core CPI module (`processor/core_groups.rs` or `cpi.rs`)

Four functions that build a `solana_program::instruction::Instruction` for `mpl_core::ID` and
`invoke_signed` it:

```rust
pub fn add_collections_to_group<'a>(core, group, payer, library, system_program, collections: &[&AccountInfo<'a>], signer_seeds) -> ProgramResult
pub fn remove_collections_from_group<'a>(...same...) -> ProgramResult
pub fn create_group<'a>(core, group, library, payer, system_program, name: &str, uri: &str, signer_seeds) -> ProgramResult
pub fn update_group<'a>(core, group, payer, library, system_program, new_name: Option<&str>, new_uri: Option<&str>, signer_seeds) -> ProgramResult
```

Data layout: one discriminator byte followed by Borsh of the args struct. `AddCollectionsToGroupV1`
and `RemoveCollectionsFromGroupV1` carry an empty args struct, so their data is the single byte.
`CreateGroupV1` is `[39] ++ borsh(name) ++ borsh(uri) ++ 0u32`. `UpdateGroupV1` is
`[41] ++ borsh(Option<String>) ++ borsh(Option<String>)`; the new update authority is an
optional account, which we never pass.

Add `#[cfg(test)]` unit tests that assert the exact bytes for each builder against vectors copied
from the 0.12.1 generated instructions, so a wrong discriminator is caught by `cargo test` rather
than by a localnet run. Every `AccountMeta` is listed in a doc comment with the Core account name
it corresponds to.

**Why hand-rolled CPIs.** Core instruction discriminators are the on-chain ABI and do not change.
Four small builders plus pinned byte-vector tests are less risk than a workspace-wide
`solana-program` 3 migration on the critical path. When the workspace moves to `mpl-core` 0.12
the module collapses to the generated `*Cpi` builders and the `Groups` scan becomes
`fetch_collection_plugin::<Groups>`; nothing else changes.

### Errors (`error.rs`), appended

| Code | Variant | When |
|---|---|---|
| 25 | `InvalidLibraryPdaDerivation` | `library` is not `[b"library", curator]` |
| 26 | `CuratorMustSign` | |
| 27 | `PublisherMustSign` | |
| 28 | `InvalidPublisher` | signer is not `GameCollectionData.publisher` |
| 29 | `LibraryDelegateAlreadySet` | opt-in on a game that already has an `UpdateDelegate` |
| 30 | `LibraryDelegateNotSet` | opt-out without a delegate |
| 31 | `InvalidLibraryDelegate` | the `UpdateDelegate` names something other than `library` |
| 32 | `GameStillListed` | opt-out remaining accounts do not cover the `Groups` plugin |
| 33 | `InvalidGroup` | account is not a Core `GroupV1` (key byte check) where the program reads one |

Core's own `InvalidAuthority`, `DuplicateEntry`, `NotFound` and `GroupVectorFull` surface
unchanged from the CPIs.

### Processor routing (`processor/mod.rs`)

Six new match arms with the existing `msg!("Instruction: ...")` convention. Add the modules to
`pub mod` / `pub use` so Shank picks up the arg structs.

### Client generation

`configs/cartridge-kinobi.cjs`:

- `updateAccountsVisitor`: add a `library` account with seeds `constant("library")`,
  `variable("curator", publicKey)`.
- `updateInstructionsVisitor`: for each new instruction, default `library` to
  `pdaValueNode(pdaLinkNode("library", "hooked"), [curator])`; default `mplCoreProgram` is
  already handled by Kinobi's program-id inference (check the existing instructions do not set
  it explicitly; follow whatever they do). For `listGameV1` / `delistGameV1` / `optOutLibraryV1`
  default `libraryBump` to the PDA's bump via `pdaBumpValueNode` if available in kinobi
  0.18.8-alpha.0; if not, the hooked helper below returns the bump and callers pass it.
- `optOutLibraryV1` needs remaining accounts. Kinobi cannot express that from Shank; add a
  hand-written wrapper in `clients/js-cartridge/src/hooked/` that takes `groups: PublicKey[]`,
  builds the generated instruction and appends them as writable non-signer metas. Export it as
  the public `optOutLibrary` and keep the generated one as an implementation detail.

`clients/js-cartridge/src/hooked/pdas.ts`: `findLibraryPda(context, { curator })`, same shape as
`findGamePda`.

Then `pnpm generate`. The Rust client regenerates automatically.

### CLI (`clients/cli`)

Commands mirroring the instruction set, following `set-cartridge-source.ts`:
`create-library --name --uri`, `update-library`, `opt-in-library --game --game-name --curator`,
`opt-out-library --game --game-name --curator` (reads the `Groups` plugin with JS 1.10 and passes
the groups), `list-game --group --game`, `delist-game --group --game`, and `get-library --group`
(prints `fetchGroupV1` membership). The keypair loaded by `loadKeypairAndSign` is the curator or
publisher as appropriate.

Bump `@metaplex-foundation/mpl-core` to `^1.10.0` in `clients/js-cartridge` and `clients/cli`
(see the JS decoding finding above).

## Tests

`clients/js-cartridge/test/library.test.ts`, using the `_setup.ts` Umi and the `releaseAndPrint`
helper pattern from `setCartridgeSource.test.ts`:

1. **Create library.** `createLibraryV1` then `fetchGroupV1`: `updateAuthority` equals
   `findLibraryPda(curator)`, `collections` empty.
2. **Opt in.** Publisher (the release identity) calls `optInLibraryV1`; `fetchCollection` shows
   `updateDelegate.additionalDelegates == [library]` with authority `UpdateAuthority`.
3. **Opt in twice** fails with `LibraryDelegateAlreadySet`.
4. **Opt in by a non-publisher** fails with `InvalidPublisher`.
5. **List.** Curator calls `listGameV1`; `fetchGroupV1().collections` contains the game and
   `fetchCollection().groups.groups` contains the group.
6. **List without opt-in** fails with Core `InvalidAuthority`.
7. **List by a non-curator** fails with `InvalidLibraryPdaDerivation` (wrong curator seeds) or
   `CuratorMustSign`.
8. **Listed games still print.** After 5, `printGameCartridgeV1` and `setCartridgeSourceV1`
   succeed on the same game. This is the regression guard for the `PluginRegistryV1Safe` finding.
9. **Delist.** Curator calls `delistGameV1`; group and `Groups` plugin no longer reference each
   other.
10. **Opt out while listed, without passing the group** fails with `GameStillListed`.
11. **Opt out while listed, with the group** removes the membership and the delegate in one
    transaction.
12. **Delist after opt-out** fails (Core `NotFound` or `InvalidAuthority`).
13. **Update library** changes name/URI; a `new_update_authority` is not reachable from the
    client at all.
14. **Compute.** Log `computeUnitsConsumed` for opt-in, list, and opt-out with one group;
    request a raised limit via `setComputeUnitLimit` if any exceeds 200k.

Rust unit tests in the CPI module pin the instruction bytes (see above).

`clients/rust-cartridge` gets a happy-path create → opt-in → list test if its existing suite
covers the other instructions; otherwise leave Rust coverage to the byte-vector tests.

## Rollout and Compatibility

- **No existing instruction changes.** Discriminators 0–5, args, and accounts are untouched.
  Existing clients keep working against the upgraded program.
- **Existing games** opt in after the fact: the publisher signs `optInLibraryV1` once. The
  website's migration step 4 ("walk the already-approved games through the handshake") is one
  transaction per publisher-game, then one `listGameV1` per game from the curator.
- **Ordering across repos.** (a) Bump JS `mpl-core` everywhere it decodes collections, including
  the website; (b) confirm or wait for Core groups on mainnet; (c) deploy this program;
  (d) create the library; (e) opt in and list. Listing a game before (a) breaks that game's
  `/demo` page and pricing reads.
- **Core upgrade coupling.** If mainnet Core lacks groups, the program can still be deployed;
  the new instructions fail with Core's `InvalidInstructionData` until Core upgrades, and nothing
  else is affected.

## Website follow-ups (for the website repo's Phase 2)

These change the website design and should be reflected there:

- The "GX group authority" keypair becomes the **curator** wallet. It never holds
  `UpdateDelegate` rights; it signs `listGameV1` / `delistGameV1`. `NEXT_PUBLIC_GX_LIBRARY_GROUP`
  is the `group` keypair's public key from `createLibraryV1`.
- The admin approve action calls the generated `listGameV1` from `@breadheads/bgl-cartridge`
  instead of `addCollectionsToGroupV1` with hand-appended remaining accounts. The "JS client sharp
  edge" section no longer applies.
- The publish flow can append `optInLibraryV1` to the transaction built in
  `POST /api/publish/prepare`; the publisher already signs that transaction. Present it as the
  informed opt-in the website doc asks for, with the narrower, accurate description: the game
  grants a program-controlled delegate that can only be used to add or remove it from GX groups.
- The "publisher can revoke and pin their game" risk is closed by `optOutLibraryV1` semantics;
  the off-chain `HIDDEN` filter stays as a product kill switch, not as the only removal path.
- `/demo/[address]` can verify membership from `collection.groups.groups` once on JS 1.10.

## Implementation Order

1. Verify Core groups on mainnet (command above); if absent, build `mpl_core.so` locally.
2. `state.rs` prefix, `error.rs` variants, CPI module with byte-vector tests. `cargo test`.
3. `CreateLibraryV1`, `OptInLibraryV1`, `ListGameV1`. Build, `pnpm generate`, bump JS mpl-core,
   write tests 1–8. This is the minimum the website needs.
4. `DelistGameV1`, `OptOutLibraryV1` with the `Groups` scan, `UpdateLibraryV1`. Tests 9–14.
5. CLI commands. Update `CLAUDE.md`'s processor listing.
6. Program deploy, then hand the group address and curator flow to the website.

## Open Questions

- Is the Core program with groups deployed to mainnet, and if not, when? Everything after step 2
  can be developed against a locally built Core, but nothing ships without it.
- Should `CreateLibraryV1` also accept a `parent` group so shelves can be created as children in
  one step? Deferred until the website wants shelves; the PDA model already supports it.
- Multiple libraries per game (an `UpdateDelegate` with several library PDAs) needs
  `UpdateCollectionPluginV1` on the delegate plugin, whose self-update rules in Core are
  restrictive (`validate_update_plugin` only approves a delegate removing itself, otherwise it
  falls through to the plugin-authority path). Test that path before promising it.
