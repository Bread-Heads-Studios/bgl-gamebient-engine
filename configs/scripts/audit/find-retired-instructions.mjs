#!/usr/bin/env node
// Read-only audit. Lists every successful transaction that called the retired
// InsertCartridgeV1 (discriminator 3) or RemoveCartridgeV1 (discriminator 4)
// instruction of bgl-cartridge, at the top level or through a CPI.
//
// Usage: node configs/scripts/audit/find-retired-instructions.mjs
//   RPC_URL  JSON-RPC endpoint (default: https://api.mainnet-beta.solana.com)

const PROGRAM = 'CART9hmcuf38a58NCYhRJmtGXJjh16eXmLr9hmhAqPZo';
const RPC_URL = process.env.RPC_URL ?? 'https://api.mainnet-beta.solana.com';
const RETIRED = new Map([
  [3, 'InsertCartridgeV1'],
  [4, 'RemoveCartridgeV1'],
]);
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Decodes a base58 string to bytes. */
export function base58Decode(text) {
  let value = 0n;
  for (const ch of text) {
    const digit = ALPHABET.indexOf(ch);
    if (digit < 0) throw new Error(`not base58: ${text}`);
    value = value * 58n + BigInt(digit);
  }
  const bytes = [];
  while (value > 0n) {
    bytes.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  for (const ch of text) {
    if (ch !== '1') break;
    bytes.unshift(0);
  }
  return bytes;
}

async function rpc(method, params) {
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 8) throw new Error(`${method}: HTTP ${res.status}`);
      await sleep(500 * 2 ** attempt);
      continue;
    }
    const body = await res.json();
    if (body.error) throw new Error(`${method}: ${body.error.message}`);
    return body.result;
  }
}

/** Every successful signature that mentions the program, newest first. */
async function allSignatures() {
  const signatures = [];
  let before;
  for (;;) {
    const page = await rpc('getSignaturesForAddress', [
      PROGRAM,
      { limit: 1000, before },
    ]);
    if (page.length === 0) return signatures;
    signatures.push(...page.filter((s) => s.err === null).map((s) => s.signature));
    before = page[page.length - 1].signature;
  }
}

/** The retired instructions a transaction ran, by name. */
export function retiredInstructions(tx) {
  const keys = [
    ...tx.transaction.message.accountKeys,
    ...(tx.meta?.loadedAddresses?.writable ?? []),
    ...(tx.meta?.loadedAddresses?.readonly ?? []),
  ];
  const instructions = [
    ...tx.transaction.message.instructions,
    ...(tx.meta?.innerInstructions ?? []).flatMap((inner) => inner.instructions),
  ];
  return instructions
    .filter((ix) => keys[ix.programIdIndex] === PROGRAM)
    .map((ix) => RETIRED.get(base58Decode(ix.data)[0]))
    .filter((name) => name !== undefined);
}

async function main() {
  const signatures = await allSignatures();
  console.error(`${signatures.length} successful transactions on ${RPC_URL}`);
  const found = [];
  for (const [i, signature] of signatures.entries()) {
    const tx = await rpc('getTransaction', [
      signature,
      { encoding: 'json', maxSupportedTransactionVersion: 0 },
    ]);
    if (tx === null) throw new Error(`transaction not found: ${signature}`);
    for (const name of retiredInstructions(tx)) found.push({ signature, name });
    if ((i + 1) % 100 === 0) console.error(`checked ${i + 1}`);
    await sleep(120);
  }
  console.log(JSON.stringify({ scanned: signatures.length, found }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
