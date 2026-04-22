# gmbnt — Gamebient Cartridge Protocol CLI

CLI for the BGL Cartridge Protocol on Solana. Manage games, cartridges, and machines from your terminal.

## Install

```bash
cd clients/cli
npm install
npm run build
```

To make `gmbnt` available globally:

```bash
npm link
```

Or run directly:

```bash
node dist/index.js <command>
```

## Global Options

| Flag | Description | Default |
|------|-------------|---------|
| `-c, --cluster <cluster>` | `mainnet`, `devnet`, `localnet`, or a custom RPC URL | `mainnet` |
| `-k, --keypair <path>` | Path to Solana keypair JSON file | `~/.config/solana/id.json` |
| `-o, --output <format>` | `table` or `json` | `table` |

## Commands

### Release a Game

Interactive mode — walks you through metadata creation, uploads cover image and JSON to Arweave, then submits the on-chain transaction:

```bash
gmbnt release-game
```

The interactive flow prompts for:
- Game name and description
- Cover image (uploaded to Arweave)
- Game URL (web page where the game is hosted)
- Demo URL (playable demo link)
- Downloadable binary (Bevy `.tar`, PICO-8 `.p8`, WASM, or other)
- Genre, platform, player count
- Price and price type (transfer or burn)

Skip the interactive builder if you already have a metadata URI:

```bash
gmbnt release-game --uri "https://arweave.net/abc123" --name "Space Invaders" --price 1000
gmbnt release-game --uri "https://arweave.net/abc123" --name "Space Invaders" --price 500 --price-type burn
```

### Commission a Machine

```bash
gmbnt commission-machine \
  --name "My Machine" \
  --uri "https://arweave.net/machine-metadata" \
  --collection <MACHINE_COLLECTION_ADDRESS>
```

Set a different owner (defaults to your keypair):

```bash
gmbnt commission-machine \
  --name "My Machine" \
  --uri "https://arweave.net/machine-metadata" \
  --collection <MACHINE_COLLECTION_ADDRESS> \
  --owner <OWNER_ADDRESS>
```

### Print a Cartridge

Mint a cartridge (buy a copy of a game):

```bash
gmbnt print-cartridge \
  --game <GAME_ADDRESS> \
  --game-name "Space Invaders"
```

Specify nonce or owner:

```bash
gmbnt print-cartridge \
  --game <GAME_ADDRESS> \
  --game-name "Space Invaders" \
  --nonce 0 \
  --owner <OWNER_ADDRESS>
```

### Insert a Cartridge

Insert a cartridge into a machine (freezes the cartridge):

```bash
gmbnt insert-cartridge \
  --cartridge <CARTRIDGE_ADDRESS> \
  --game <GAME_ADDRESS> \
  --game-name "Space Invaders" \
  --machine <MACHINE_ADDRESS> \
  --machine-collection <MACHINE_COLLECTION_ADDRESS>
```

### Remove a Cartridge

Remove a cartridge from a machine (unfreezes it):

```bash
gmbnt remove-cartridge \
  --cartridge <CARTRIDGE_ADDRESS> \
  --game <GAME_ADDRESS> \
  --game-name "Space Invaders" \
  --machine <MACHINE_ADDRESS> \
  --machine-collection <MACHINE_COLLECTION_ADDRESS>
```

### Query Commands

Fetch details for a single game, machine, or cartridge:

```bash
gmbnt get-game <GAME_ADDRESS>
gmbnt get-machine <MACHINE_ADDRESS>
gmbnt get-cartridge <CARTRIDGE_ADDRESS>
```

List assets owned by your wallet (or a specific address):

```bash
gmbnt list-games
gmbnt list-games --publisher <ADDRESS>

gmbnt list-machines
gmbnt list-machines --owner <ADDRESS> --collection <COLLECTION_ADDRESS>

gmbnt list-cartridges
gmbnt list-cartridges --owner <ADDRESS> --game <GAME_ADDRESS>
```

### JSON Output

Pipe any command to scripts with `--output json`:

```bash
gmbnt get-game <ADDRESS> --output json
gmbnt list-cartridges --output json | jq '.[] | select(.frozen == true)'
```

## Using Devnet

```bash
gmbnt -c devnet release-game
gmbnt -c devnet get-game <ADDRESS>
gmbnt -c devnet list-machines --owner <ADDRESS>
```

## Using a Different Keypair

```bash
gmbnt -k ~/my-other-wallet.json release-game
```

## Game Metadata Format

When using the interactive `release-game` flow, the CLI builds and uploads a JSON file like this:

```json
{
  "name": "Space Invaders",
  "description": "Classic arcade shooter reimagined on-chain",
  "image": "https://arweave.net/abc123",
  "external_url": "https://mygame.com",
  "attributes": [
    { "trait_type": "Genre", "value": "Action" },
    { "trait_type": "Platform", "value": "Web" },
    { "trait_type": "Players", "value": "1-4" }
  ],
  "properties": {
    "files": [
      { "uri": "https://arweave.net/abc123", "type": "image/png" }
    ],
    "category": "game",
    "game_url": "https://mygame.com/play",
    "demo_url": "https://mygame.com/demo",
    "binary_url": "https://mygame.com/download.tar",
    "binary_type": "bevy-tar"
  }
}
```

### Properties Fields

| Field | Description |
|-------|-------------|
| `game_url` | Web page where the game is hosted |
| `demo_url` | Link to a playable demo |
| `binary_url` | Download link for the game binary |
| `binary_type` | Binary format: `bevy-tar`, `pico8-p8`, `wasm`, or `other` |
