#!/user/bin/env node

import * as yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
.usage('Usage: $0 -h [host address] -p [port]')
.demandOption(['h'])
.argv;

import { ping } from './index';

const thread = ping(argv.h as string)




async function shutdown() {
  try {
    thread.kill();
  } catch (er) {
    console.error(er);
    process.exitCode = 1;
  }
  process.exit();
}

process.on('SIGINT', async function onSigint () {
	console.info('Shutting down ', new Date().toISOString());
  await shutdown();
});

process.on('SIGTERM', async function onSigterm () {
  console.info('Shutting down ', new Date().toISOString());
  await shutdown();
});

