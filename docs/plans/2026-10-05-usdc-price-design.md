# Alternate USDC Price

## Background

Games are priced in the payment token (CRUMBS), whose dollar value moves. A
publisher who wants a stable price can now also set a USDC price. A game with
one can be bought with either currency; the publisher chooses the two numbers
independently.

## Data Model (`programs/bgl-cartridge/src/state.rs`)

The game collection's LinkedAppData is versioned by its first byte. Version 0
is what every release before this change wrote:

```rust
pub struct GameCollectionData   { version: u8 /* 0 */, price_type: u8, price: u64, publisher: Pubkey }
pub struct GameCollectionDataV1 { version: u8 /* 1 */, price_type: u8, price: u64, publisher: Pubkey, usdc_price: u64 }
```

`GameCollectionDataV1::load` reads either version and upgrades version 0 in
memory with `usdc_price = 0`, which means "not accepted". New writes
(`ReleaseGameV1`, `UpdateGamePriceV1`) are always version 1, so existing
collections upgrade on their next reprice and nothing migrates in bulk. The
JS client mirrors this with `deserializeGameCollectionData(bytes)`.

`usdc_price` is in USDC base units (6 decimals). USDC is always transferred
to the game's USDC token account; `price_type` (Transfer or Burn) applies to
the payment token only.

```rust
pub enum Currency { Crumbs, Usdc }
pub const USDC_MINT: Pubkey          // mainnet USDC
pub const LOCALNET_USDC_MINT: Pubkey // test stand-in, accepted only in epoch 0
```

## Instructions

**`UpdateGamePriceV1`** (publisher only) gains `usdc_price: u64` and four
accounts: `game_usdc_token_account`, `usdc_mint`, `token_program`,
`associated_token_program`. When `usdc_price > 0` it creates the game's USDC
associated token account idempotently (the payer funds the rent), so a game
that accepts USDC always has somewhere to receive it before the first USDC
purchase. The instruction is new in the same release, so this is not a wire
change for anyone.

**`PrintGameCartridgeV1`** gains a trailing `currency: u8` byte. The
instruction data used to be exactly three bytes (discriminator, nonce, bump);
the program accepts three or four bytes and reads a missing byte as
`Crumbs`, so clients built against 0.3.0/0.4.0 keep working unchanged. The
account list is unchanged. Paying in USDC means passing `currency: Usdc` and
pointing `payment_mint`, `game_token_account` and `payer_token_account` at
USDC instead of the CRUMBS defaults. The program then requires
`usdc_price > 0` (`UsdcNotAccepted` otherwise), checks the mint is USDC
(`InvalidUsdcMint`), and transfers `usdc_price`.

Accounts cannot be added to `PrintGameCartridgeV1` without breaking old
clients (shank's context fails with `NotEnoughAccountKeys` when fewer
accounts are passed), which is why the game's USDC account is created by
`UpdateGamePriceV1` rather than lazily at print time.

**`ReleaseGameV1`** is unchanged on the wire and writes version 1 data with
`usdc_price = 0`. A publisher sets the USDC price with `UpdateGamePriceV1`,
which the website bundles into the release transaction when asked.

## Errors

26 `InvalidCurrency`, 27 `UsdcNotAccepted`, 28 `InvalidUsdcMint`,
29 `InvalidGameDataVersion`.

## Tests

`clients/js-cartridge/test/printGameCartridgeUsdc.test.ts` and additions to
`updateGamePrice.test.ts`. The localnet has no USDC, so the tests create the
stand-in mint from `test/fixtures/usdc-mint.json` (the mint is its own mint
authority) and mint test balances with it. One test sends the legacy
three-byte print payload to prove old clients still pay in CRUMBS.
