#!/user/bin/env node

import { map, Subject, Subscription } from 'rxjs';
import * as yargs from 'yargs';
import { ApplicationCommand } from './constants';

const argv = yargs(process.argv.slice(2))
.usage('Usage: $0 <command> [options]')
.command('mqtt', 'Bridge communication between EnvisaLink and MQTT')
.example('$0 mqtt -h 192.168.0.10 -p 4025 -c 1234 -s user -m 192.168.0.20', 'Bridges the EnvisaLink with an MQTT server.')
.describe({
  h: 'EnvisaLink host name',
  p: 'EnvisaLink port number',
  s: 'EnvisaLink login password',
  c: 'Alarm system pin code',
  m: 'MQTT host'
})
.alias({
  h: 'host',
  p: 'post',
  s: 'pass',
  c: 'code',
  m: 'mqtthost'
})
.default({
  h: 'localhost',
  p: 4025,
  s: 'user',
  c: '1234',
  m: 'localhost'
})
.help('q')
.alias('q', 'help')
.demandCommand()
.argv;




import {
  cleanStream,
  envisalink$,
  handleCmdKeypadLEDState,
  handleCmdLogin,
  handleCmdPartitionState,
  handleCmdReaction,
  handleCmdSystemError,
  handleCmdTimeBroadcast,
  handleCmdZoneState,
  handleCmdZoneTimerDump,
  repeatOnComplete,
  retryOnError,
} from './index';


const onEnvisaLinkReady = () => {
  to.next([ApplicationCommand.DumpZoneTimers,'']);
  to.next([ApplicationCommand.StatusReport,'']);
}

const port:number = argv.p;
const to = new Subject<[string,string]>();
const to$ = to.pipe(map(([cmd,data]) => `${cmd}${data}`));
const con$ = envisalink$(argv.h, port, to$);
const from$ = con$.pipe(
  retryOnError(),
  repeatOnComplete(),
  cleanStream(),
);
const handler$ = from$.pipe(
  handleCmdReaction(),
  handleCmdSystemError(),
  handleCmdLogin(to, argv.s, onEnvisaLinkReady),
  handleCmdKeypadLEDState(),
  handleCmdTimeBroadcast(),
  handleCmdZoneState(),
  handleCmdZoneTimerDump(),
  handleCmdPartitionState(),
);

let sub:Subscription;
if (argv._.includes('mqtt')) {
  sub = handler$.subscribe((unhandled) => {
    console.log('Unhandled:',unhandled)
  })
}


async function shutdown() {
  try {
    to.complete();
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

