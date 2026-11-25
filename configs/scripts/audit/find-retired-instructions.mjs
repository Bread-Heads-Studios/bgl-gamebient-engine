#!/usr/bin/env node
// Read-only audit. Lists every successful transaction that called the retired
// InsertCartridgeV1 (discriminator 3) or RemoveCartridgeV1 (discriminator 4)
// instruction of bgl-cartridge, at the top level or through a CPI.
//
// Usage: node configs/scripts/audit/find-retired-instructions.mjs [--self-test]
//   RPC_URL      JSON-RPC endpoint (default: https://api.mainnet-beta.solana.com)
//   --self-test  run the detector over built-in synthetic transactions only
//                (no network); exits 1 if any case fails. A normal run does
//                the same check silently first and aborts if it fails.

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

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

/** Every signature that mentions the program, newest first. */
async function allSignatures() {
  const signatures = [];
  let before;
  for (;;) {
    const page = await rpc('getSignaturesForAddress', [
      PROGRAM,
      { limit: 1000, before },
    ]);
    if (page.length === 0) return signatures;
    signatures.push(...page);
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

const OTHER = '11111111111111111111111111111112';
const WRITABLE = 'LutWritab1eAddress1111111111111111111111111';
const READONLY = 'LutReadonlyAddress111111111111111111111111';
// Base58 of the single bytes 3, 4, 12 and 13.
const IX = { insertV1: '4', removeV1: '5', insertV2: 'D', removeV2: 'E' };

function syntheticTx({ keys = [OTHER, PROGRAM], top = [], inner = null, loaded }) {
  return {
    transaction: { message: { accountKeys: keys, instructions: top } },
    meta: {
      innerInstructions: inner,
      ...(loaded === undefined ? {} : { loadedAddresses: loaded }),
    },
  };
}

const call = (programIdIndex, data) => ({ programIdIndex, data });

const SELF_TEST_CASES = [
  ['top-level InsertCartridgeV1', syntheticTx({ top: [call(1, IX.insertV1)] }), ['InsertCartridgeV1']],
  ['top-level RemoveCartridgeV1', syntheticTx({ top: [call(1, IX.removeV1)] }), ['RemoveCartridgeV1']],
  [
    'InsertCartridgeV1 only as an inner (CPI) instruction',
    syntheticTx({ top: [call(0, IX.insertV1)], inner: [{ index: 0, instructions: [call(1, IX.insertV1)] }] }),
    ['InsertCartridgeV1'],
  ],
  [
    'program id only in loadedAddresses.writable',
    syntheticTx({
      keys: [OTHER],
      top: [call(1, IX.insertV1)],
      loaded: { writable: [PROGRAM], readonly: [READONLY] },
    }),
    ['InsertCartridgeV1'],
  ],
  [
    'program id only in loadedAddresses.readonly',
    syntheticTx({
      keys: [OTHER],
      top: [call(2, IX.removeV1)],
      loaded: { writable: [WRITABLE], readonly: [PROGRAM] },
    }),
    ['RemoveCartridgeV1'],
  ],
  [
    'V2 insert and remove (12, 13) are not retired',
    syntheticTx({ top: [call(1, IX.insertV2), call(1, IX.removeV2)] }),
    [],
  ],
  [
    'discriminator 3 sent to a different program',
    syntheticTx({ top: [call(0, IX.insertV1)] }),
    [],
  ],
  [
    'innerInstructions null and no loadedAddresses',
    syntheticTx({ top: [call(1, IX.insertV2)], inner: null }),
    [],
  ],
];

/** Runs the detector over synthetic transactions; returns one result per case. */
export function selfTest() {
  return SELF_TEST_CASES.map(([name, tx, expected]) => {
    let actual;
    try {
      actual = retiredInstructions(tx);
    } catch (error) {
      actual = `threw ${error.message}`;
    }
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    return { name, ok, expected, actual };
  });
}

function reportSelfTest(results, verbose) {
  const passed = results.filter((r) => r.ok).length;
  for (const r of results) {
    if (verbose) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}`);
    if (!r.ok) {
      console.error(
        `self-test failed: ${r.name}: expected ${JSON.stringify(r.expected)}, got ${JSON.stringify(r.actual)}`
      );
    }
  }
  if (verbose) console.log(`self-test: ${passed}/${results.length} passed`);
  return passed === results.length;
}

async function main() {
  const selfTestOnly = process.argv.includes('--self-test');
  const selfTestOk = reportSelfTest(selfTest(), selfTestOnly);
  if (selfTestOnly) process.exit(selfTestOk ? 0 : 1);
  if (!selfTestOk) throw new Error('detector self-test failed; refusing to scan');

  const all = await allSignatures();
  const ok = all.filter((s) => s.err === null);
  console.error(`${ok.length} successful transactions on ${new URL(RPC_URL).hostname}`);
  const found = [];
  for (const [i, { signature }] of ok.entries()) {
    const tx = await rpc('getTransaction', [
      signature,
      { encoding: 'json', maxSupportedTransactionVersion: 0 },
    ]);
    if (tx === null) throw new Error(`transaction not found: ${signature}`);
    for (const name of retiredInstructions(tx)) found.push({ signature, name });
    if ((i + 1) % 100 === 0) console.error(`checked ${i + 1}`);
    await sleep(120);
  }
  const last = ok[ok.length - 1];
  const oldest = last ? { signature: last.signature, blockTime: last.blockTime ?? null } : null;
  console.log(
    JSON.stringify(
      { scanned: ok.length, skippedFailed: all.length - ok.length, oldest, found },
      null,
      2
    )
  );
}

/** True when this file is the script node was started with (symlinks resolved). */
function isMain() {
  try {
    return (
      Boolean(process.argv[1]) &&
      import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
    );
  } catch {
    return false;
  }
}

if (isMain()) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
