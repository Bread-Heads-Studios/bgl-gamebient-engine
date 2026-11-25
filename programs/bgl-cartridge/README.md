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
- **Verifying a link** (JS client): use `isInsertedIn(umi, cartridge, machine, expect)`, or `isInserted(context, { cartridge, machine }, expect)` on accounts already fetched. It requires both accounts to be owned by mpl-core, the machine to sit at its machine PDA, the slot to hold the machine's address, and **the cartridge and the machine to have the same owner**. A machine that is sold or transferred stops carrying the previous owner's cartridges, although their slots still name it.
- **Always pin the trusted collections.** The last argument, `expect`, is optional, but a result obtained without it proves only internal consistency: a machine PDA in SOME collection, a link and one owner. Anyone can commission machines in a collection they control, so such a result must not by itself gate a paid game. Pass the machine collection you trust and the game the cartridge must belong to:

  ```ts
  const ok = await isInsertedIn(umi, cartridge, machine, {
    machineCollection, // the machine collection you trust
    game, // the game collection the cartridge must belong to
  });
  ```

- **Operator readers** take `{ machineCollection }` the same way. `fetchMachineOperator(umi, machine, { machineCollection })` returns the operator, or null if there is none, the account is not a machine, or it is in another collection. `verifiedMachineOperator(context, asset, { machineCollection })` does the same for an asset already fetched. Pin the collection: without it a non-null result must not by itself decide who may operate a cabinet.
- **Raw readers do not verify.** `machineOperator(asset)`, `insertedMachine(asset)` and `findInsertedMachine(umi, cartridge)` return only what the account says, with no machine, ownership or collection check. Do not use them to decide access.
