// Writes a copy of mainnet's USDC mint account whose mint authority is the
// localnet authority, so JS tests can mint USDC on the local validator.
// Usage: node configs/scripts/make-usdc-fixture.mjs
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
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
    params: [USDC, { encoding: "base64" }],
  }),
});
const { result } = await res.json();
const account = result.value;
const data = Buffer.from(account.data[0], "base64");
// SPL Mint layout: COption<Pubkey> mint_authority = u32 tag (1 = Some) + 32 bytes.
data.writeUInt32LE(1, 0);
authority.copy(data, 4);

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "accounts", `${USDC}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      pubkey: USDC,
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
