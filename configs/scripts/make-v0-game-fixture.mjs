// Writes a copy of mainnet's "Tire Stack" game collection (v0 data, 42 bytes)
// with its publisher replaced by the localnet authority, so JS tests can
// reprice a real v0 game on the local validator.
// Usage: node configs/scripts/make-v0-game-fixture.mjs
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const GAME = "AQxtV3VaGZ7fdCfw9nRqeHmJ1ywNzkEVUGWPiEmpb7bn";
const PUBLISHER = "CVGXxNYhfNMwRRRgVpFaCPPos24WmmCevPseEN2Z3CPE";
const LOCALNET_AUTHORITY = "2gy9s5sUQY3icPwF5y1koz1UNkQW5EdAQxLm4BxiePM5";
const RPC = process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";

// Minimal base58 decoder (avoids a dependency at the repo root).
function base58Decode(s) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const c of s) n = n * 58n + BigInt(alphabet.indexOf(c));
  const bytes = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const c of s) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return Buffer.from(bytes);
}

const authority = base58Decode(LOCALNET_AUTHORITY);
if (authority.length !== 32) throw new Error("bad authority key length");

const res = await fetch(RPC, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "getAccountInfo",
    params: [GAME, { encoding: "base64" }],
  }),
});
const { result } = await res.json();
const account = result.value;
const data = Buffer.from(account.data[0], "base64");
// The publisher key occurs twice: first as a royalty creator, then as the
// publisher field closing the 42-byte v0 LinkedAppData record. Only the
// record's copy (the last occurrence) is replaced.
const publisher = base58Decode(PUBLISHER);
const first = data.indexOf(publisher);
const last = data.lastIndexOf(publisher);
if (first < 0 || first === last || data.indexOf(publisher, first + 1) !== last) {
  throw new Error("expected the publisher exactly twice in the game account");
}
authority.copy(data, last);

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "accounts", `${GAME}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      pubkey: GAME,
      account: {
        lamports: account.lamports,
        data: [data.toString("base64"), "base64"],
        owner: account.owner,
        executable: false,
        rentEpoch: 0,
        space: data.length,
      },
    },
    null,
    2
  ) + "\n"
);
console.log(`wrote ${out}`);
