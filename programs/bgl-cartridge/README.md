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

## Machines and cartridge links

A machine is an arcade cabinet on chain. A cartridge is "inserted" into a machine by writing the machine's address into the cartridge. Design: `docs/plans/2026-11-25-arcade-pilot-ux-design.md` in the ColecoVision GX workspace.

- **Machine:** a Core asset at PDA `["machine", machine_collection, name]` in a machine collection. Its AppData holds `MachineData` (v1, 33 bytes): `version` and `operator`, the device key of the cabinet that may play the machine's cartridges. The all-zero key means no operator.
- **A machine's name is a PDA seed and must never be changed.** Renaming the asset through mpl-core would make its operator unsettable and its links unreadable.
- `commissionMachineV2` (machine collection authority + payer sign): creates the machine for any owner and writes its operator in the same instruction. The owner does not sign. `commissionMachineV1` still works and leaves the operator unset.
- `setMachineOperatorV1` (machine owner + payer sign): replaces the operator. The all-zero key revokes it.
- **Link slot:** each cartridge has one slot, its LinkedAppData. Empty means not inserted. Otherwise it holds the 32-byte address of one machine. One slot is what makes one copy serve one cabinet.
- `insertCartridgeV2` (owner + payer sign): the signer must own both the cartridge and the machine, and the slot must be empty (else `CartridgeAlreadyInserted`). Writes the machine's address into the slot. The machine is not written, so a machine holds any number of cartridges.
- `removeCartridgeV2` (cartridge owner + payer sign): clears the slot. It does not need the machine.
- `insertCartridgeV1` and `removeCartridgeV1` are retired and fail with `InstructionRetired`. V1 wrote the cartridge's own key into the slot. Readers treat that value as empty.
- **Verifying a link** (JS client): use `isInsertedIn(umi, cartridge, machine, expect)`, or `isInserted(context, { cartridge, machine }, expect)` on accounts already fetched. It requires both accounts to be owned by mpl-core, the machine to sit at its machine PDA in the trusted machine collection, the cartridge to belong to the trusted game, the slot to hold the machine's address, and **the cartridge and the machine to have the same owner**. A machine that is sold or transferred stops carrying the previous owner's cartridges, although their slots still name it.
- **The pins are required and fail closed.** The last argument, `expect`, is `{ machineCollection, game }` for the inserted checks and `{ machineCollection }` for the operator checks. Anyone can commission machines in a collection they control, so without the pins a result proves only internal consistency. If `expect` is missing, or a key is missing, `undefined`, `null` or empty (an unset environment variable, an untyped JS caller), the gate returns `false` (or `null`), never the unpinned answer, and never throws.

  ```ts
  const ok = await isInsertedIn(umi, cartridge, machine, {
    machineCollection, // the machine collection you trust
    game, // the game collection the cartridge must belong to
  });
  ```

- **Gates:** `isInsertedIn`, `isInserted`, `fetchMachineOperator(umi, machine, { machineCollection })` and `verifiedMachineOperator(context, asset, { machineCollection })` take the required pins. `isMachine(context, asset, expect?)` keeps `expect` optional, but a `machineCollection` that is present and falsy gives false.
- **Raw readers verify nothing they are not listed as verifying.** `findInsertedMachine(umi, cartridge)` checks only that the cartridge account is owned by mpl-core, and returns what its link slot says. `insertedMachine(asset)` and `machineOperator(asset)` check nothing: not the owner program, not the collection, not that the asset is a machine. Do not use them to decide access. (`machineOperator` takes no pin; use `verifiedMachineOperator` for that.)
- **Resolve a device to its machine through the machine address it registered. Never look a machine up by its operator key.** Any machine owner can name any key as operator, with no co-signature from the device, so "the machine whose operator is K" can be set up by anyone.
- **The machine collection's update authority is a superuser over machines.** It commissions them and, as the collection's update authority, can remove and re-add a machine's AppData and so reset an operator. Keep that key accordingly.
- `InsertCartridgeV2` also checks on chain that the machine's update authority is the machine collection passed (as well as the PDA derivation).

## Breaking changes

- `insertCartridgeV1` and `removeCartridgeV1` are retired and fail with `InstructionRetired`; use the V2 instructions.
- CLI `get-machine` JSON no longer has `insertedCartridge` and now has `operator`.
- The JS gate helpers require `expect` (see above); calls that omitted it now return false/null.
