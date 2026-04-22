#!/usr/bin/env node

import { Command } from 'commander';
import { registerCommissionMachine } from './commands/commission-machine';
import { registerReleaseGame } from './commands/release-game';
import { registerPrintCartridge } from './commands/print-cartridge';
import { registerInsertCartridge } from './commands/insert-cartridge';
import { registerRemoveCartridge } from './commands/remove-cartridge';
import { registerGetGame } from './commands/get-game';
import { registerGetMachine } from './commands/get-machine';
import { registerGetCartridge } from './commands/get-cartridge';
import { registerListGames } from './commands/list-games';
import { registerListMachines } from './commands/list-machines';
import { registerListCartridges } from './commands/list-cartridges';
import { DEFAULT_KEYPAIR_PATH } from './utils/constants';

const program = new Command();

program
  .name('gmbnt')
  .description('CLI for the BGL Cartridge Protocol on Solana')
  .version('0.1.0')
  .option(
    '-c, --cluster <cluster>',
    'Solana cluster: mainnet, devnet, localnet, or a URL',
    'mainnet'
  )
  .option(
    '-k, --keypair <path>',
    'Path to keypair file',
    DEFAULT_KEYPAIR_PATH
  )
  .option(
    '-o, --output <format>',
    'Output format: table or json',
    'table'
  );

// Transaction commands
registerCommissionMachine(program);
registerReleaseGame(program);
registerPrintCartridge(program);
registerInsertCartridge(program);
registerRemoveCartridge(program);

// Read commands
registerGetGame(program);
registerGetMachine(program);
registerGetCartridge(program);
registerListGames(program);
registerListMachines(program);
registerListCartridges(program);

program.parse();
