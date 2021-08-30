#!/user/bin/env node

import { map, Subject, Subscription } from 'rxjs';
import * as yargs from 'yargs';
import { ApplicationCommand, TPICommand } from './constants';

const argv = yargs(process.argv.slice(2))
.usage('Usage: $0 <command> [options]')
.command('mqtt', 'Bridge communication between EnvisaLink and MQTT')
.example('$0 mqtt -h 192.168.0.10 -p 4025 -c 1234 -s user -m 192.168.0.20', 'Bridges the EnvisaLink with an MQTT server.')
.describe({
  h: 'EnvisaLink host name',
  p: 'EnvisaLink port number',
  s: 'EnvisaLink login password',
  c: 'Alarm system pin code',
  m: 'MQTT host',
  t: 'MQTT topic',
})
.alias({
  h: 'host',
  p: 'post',
  s: 'pass',
  c: 'code',
  m: 'mqtthost',
  t: 'topic',
})
.default({
  h: 'localhost',
  p: 4025,
  s: 'user',
  c: '1234',
  m: 'localhost',
  t: 'envisalink',
})
.help('q')
.alias('q', 'help')
.demandCommand()
.argv;




import {
  createCommandStream,
  handleCmdKeypadLEDState,
  handleCmdLogin,
  handleCmdPartitionState,
  handleCmdReaction,
  handleCmdSystemError,
  handleCmdTimeBroadcast,
  handleCmdTrouble,
  handleCmdZoneState,
  handleCmdZoneTimerDump,
} from './envisalink';


const port: number = argv.p;
const host: string = argv.h;
const envisaLinkPass: string = argv.s;
const commandStreamToEnvisalink = new Subject<[string,string]>();
const commandStreamFromEnvisaLink$ = createCommandStream(commandStreamToEnvisalink, host, port);
const $ = commandStreamFromEnvisaLink$.pipe(
  handleCmdZoneState((zone,restored,situation,partition) => {
    // TODO
  }),
  handleCmdPartitionState((partition,state) => {
    // TODO
  }),
  handleCmdLogin(commandStreamToEnvisalink, envisaLinkPass, () => {
    commandStreamToEnvisalink.next([ApplicationCommand.DumpZoneTimers,'']);
    commandStreamToEnvisalink.next([ApplicationCommand.StatusReport,'']);
  }),
  handleCmdKeypadLEDState((led,state) => {
    // TODO
  }),
  handleCmdReaction((ackcmd) => {
    // TODO
  }),
  handleCmdTrouble((troubleLeds) => {
    // TODO
  }),
  handleCmdTimeBroadcast((date) => {
    // TODO
  }),
  handleCmdZoneTimerDump((timers) => {
    // TODO
  }),
  handleCmdSystemError(),
);

let sub:Subscription;
if (argv._.includes('mqtt')) {
  sub = $.subscribe((unhandled) => {
    console.log('Unhandled:',unhandled)
  })
}


async function shutdown() {
  try {
    commandStreamToEnvisalink.complete();
    if (sub && !sub.closed) sub.unsubscribe();
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

