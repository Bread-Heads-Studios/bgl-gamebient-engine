import chalk from 'chalk';
import Table from 'cli-table3';

export type OutputFormat = 'table' | 'json';

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, replacer, 2));
}

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

export function printDetail(label: string, value: string): void {
  console.log(`  ${chalk.gray(label.padEnd(20))} ${value}`);
}

export function printHeader(title: string): void {
  console.log();
  console.log(chalk.bold(title));
  console.log(chalk.gray('─'.repeat(60)));
}

export function printSuccess(message: string): void {
  console.log(chalk.green(`\n  ${message}`));
}

export function printError(message: string): void {
  console.error(chalk.red(`\n  Error: ${message}`));
}

export function printWarning(message: string): void {
  console.log(chalk.yellow(`\n  Warning: ${message}`));
}

export function createTable(headers: string[]): Table.Table {
  return new Table({
    head: headers.map((h) => chalk.cyan(h)),
    style: { head: [], border: [] },
    chars: {
      top: '─',
      'top-mid': '┬',
      'top-left': '┌',
      'top-right': '┐',
      bottom: '─',
      'bottom-mid': '┴',
      'bottom-left': '└',
      'bottom-right': '┘',
      left: '│',
      'left-mid': '├',
      mid: '─',
      'mid-mid': '┼',
      right: '│',
      'right-mid': '┤',
      middle: '│',
    },
  });
}

export function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 3) + '...';
}

export function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function formatPrice(price: bigint | number): string {
  return BigInt(price).toLocaleString();
}
