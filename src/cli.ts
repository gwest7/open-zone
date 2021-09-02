#!/user/bin/env node

import { map, Subject, Subscription } from 'rxjs';
import * as yargs from 'yargs';
import { ApplicationCommand, TPICommand, ZoneActivityType } from './constants';

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
import { connect, connectDebug, IMsg, IPublishMsg } from './mqtt';


const argv = yargs(process.argv.slice(2))
.usage('Usage: $0 <command> [options]')
.command('mqtt', 'Bridge communication between EnvisaLink and MQTT')
.command('log', 'Print the traffic meant for MQTT to stdout instead ')
.example('$0 mqtt -h 192.168.0.10 -p 4025 -c 1234 -s user -m 192.168.0.20', 'Bridges the EnvisaLink with an MQTT server.')
.describe({
  h: 'EnvisaLink host name',
  p: 'EnvisaLink port number',
  s: 'EnvisaLink login password',
  c: 'Alarm system pin code',
  u: 'MQTT broker URL',
  t: 'MQTT topic',
})
.alias({
  h: 'host',
  p: 'port',
  s: 'pass',
  c: 'code',
  u: 'url',
  t: 'topic',
})
.default({
  h: 'localhost',
  p: 4025,
  s: 'user',
  c: '1234',
  u: 'mqtt://localhost',
  t: 'envisalink',
})
.help('q')
.alias('q', 'help')
.demandCommand()
.argv;




// setup EnvisaLink connection
const port: number = argv.p;
const host: string = argv.h;
const envisaLinkPass: string = argv.s;
const commandStreamToEnvisalink = new Subject<[string,string]>();
const commandStreamFromEnvisaLink$ = createCommandStream(commandStreamToEnvisalink, host, port);

// setup MQTT connection
const brokerUrl: string = argv.u;
const TOPIC: string = argv.t;
const _sub = new Subject<string | string[]>();
const _unsub = new Subject<string | string[]>();
const _pub = new Subject<IPublishMsg>();
const mqtt$ = connect(brokerUrl, _sub, _unsub, _pub);

// setup stdout (fake MQTT)
const fakeMsg$ = new Subject<IMsg>();
const mqttFake$ = connectDebug(brokerUrl, _sub, _unsub, _pub, fakeMsg$);


// setup bridge
const zoneTimers:Map<number,{
  id: number,
  situation: ZoneActivityType,
  restored: boolean,
  since: number,
  partition?: string,
}> = new Map();
const $ = commandStreamFromEnvisaLink$.pipe(
  handleCmdZoneState((zone,restored,situation,partition) => {
    const key = +zone;
    if (zoneTimers.has(key)) {
      const state = zoneTimers.get(key)!;
      state.situation = situation;
      state.restored = restored;
      state.since = Date.now();
      if (partition) state.partition = partition; else delete state.partition;
      _pub.next({
        topic: `tele/${TOPIC}/zone/${key}`,
        payload: JSON.stringify(state),
        opts: { retain: true },
      })
    }
  }),
  handleCmdPartitionState((partition,state) => {
    _pub.next({
      topic: `tele/${TOPIC}/partition/${+partition}`,
      payload: JSON.stringify({state}),
      opts: { retain: true }
    });
  }),
  handleCmdLogin(commandStreamToEnvisalink, envisaLinkPass, () => {
    // 1. login complete -> now get the durations that zones have been restored
    commandStreamToEnvisalink.next([ApplicationCommand.DumpZoneTimers,'']);
  }),
  handleCmdKeypadLEDState((led,state) => {
    _pub.next({
      topic: `tele/${TOPIC}/indicator/${led}`,
      payload: JSON.stringify({ id: led, state, since: Date.now()}),
      opts: { retain: true }
    });
  }),
  handleCmdReaction((ackcmd) => {
    console.debug('EnvisaLink acknowledged command', ackcmd)
  }),
  handleCmdTrouble((led,state) => {
    _pub.next({
      topic: `tele/${TOPIC}/trouble/${led}`,
      payload: JSON.stringify({ id: led, state, since: Date.now()}),
      opts: { retain: true }
    });
  }),
  handleCmdTimeBroadcast((date) => {
    console.log('EnvisaLink module time:', date);
  }),
  handleCmdZoneTimerDump((timers) => {
    timers.forEach(({zone,restored,duration}) => {
      const since = Date.now() - (duration * 1000);
      const state = { id: zone, situation: ZoneActivityType.Normal, restored, since };
      zoneTimers.set(zone, state);
      _pub.next({
        topic: `tele/${TOPIC}/zone/${zone}`,
        payload: JSON.stringify(state),
        opts: { retain: true }
      })
    });
    // 2. got timers -> now get request a report of all states
    commandStreamToEnvisalink.next([ApplicationCommand.StatusReport,'']);
  }),
  handleCmdSystemError(),
);
const timerEnvisalinkPoll = setInterval(() => {
  commandStreamToEnvisalink.next(['000','']);
}, 1000 * 60 * 10);


let sub:Subscription;
if (argv._.includes('mqtt')) {
  sub = $.subscribe((unhandled) => {
    console.log('Unhandled:',unhandled);
  });
  sub.add(mqtt$.subscribe(({topic, payload, packet}) => {
    console.log('message', topic, payload.toString());
  }));
} else if (argv._.includes('log')) {
  sub = $.subscribe((unhandled) => {
    console.log('Unhandled:',unhandled);
  });
  sub.add(mqttFake$.subscribe(({topic, payload, packet}) => {
    console.log('message', payload.toString());
  }));
  
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

