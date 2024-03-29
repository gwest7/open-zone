#!/user/bin/env node

import { existsSync, readFileSync } from 'fs';
import { map, repeat, retry, Subject, Subscription, tap, timer } from 'rxjs';
import * as yargs from 'yargs';
import { ApplicationCommand, PanicType, PartitionCommand, systemErrorMsg, TPICommand, ZoneActivityType } from './constants';

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
} from './index';
import { createMessageStream, IMsg, interest, IPublishMsg, ISub, IUnsub, createMessageStreamDebug } from '@binaryme/picky';
import { IClientOptions } from 'mqtt';


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
  l: 'Log level: 0=off, 1=info',
  'mqtt-username': 'MQTT username',
  'mqtt-password': 'MQTT password',
})
.alias({
  h: 'host',
  p: 'port',
  s: 'pass',
  c: 'code',
  u: 'url',
  t: 'topic',
  l: 'log',
})
.default({
  h: 'localhost',
  p: 4025,
  s: 'user',
  c: '1234',
  u: 'mqtt://localhost',
  t: 'tele/envisalink',
  l: 0,
  'mqtt-username': '',
  'mqtt-password': '',
})
.help('q')
.alias('q', 'help')
.demandCommand()
.argv;

if (existsSync('.open-zone-config.json')) {
  try {
    const config = JSON.parse(readFileSync('.open-zone-config.json').toString());
    if (config.host) process.env.OZ_HOST = config.host;
    if (config.port) process.env.OZ_PORT = config.port.toString();
    if (config.pass) process.env.OZ_PASS= config.pass;
    if (config.code) process.env.OZ_CODE = config.code.toString();
    if (config.url) process.env.OZ_URL = config.url;
    if (config.topic) process.env.OZ_TOPIC = config.topic;
    if (config.log) process.env.OZ_LOG = config.log;
    if (config.mqttUsername) process.env.OZ_MQTT_USERNAME = config.mqttUsername;
    if (config.mqttPassword) process.env.OZ_MQTT_PASSWORD = config.mqttPassword;
  } catch (error) {
    console.log('Error reading config.', error);
  }
}


// setup EnvisaLink connection
const port: number = +(process.env.OZ_PORT ?? '0') || argv.p;
const host: string = process.env.OZ_HOST || argv.h;
const envisaLinkPass: string = process.env.OZ_PASS || argv.s;
const logger = (...args:any[]) => process.env.log && console.log(new Date(), ...args);
const commandStreamToEnvisalink = new Subject<[string,string]>();
const commandStreamFromEnvisaLink$ = createCommandStream(commandStreamToEnvisalink, host, port, logger);

// setup MQTT connection
const brokerUrl: string = process.env.OZ_URL || argv.u;
const TOPIC: string = process.env.OZ_TOPIC || argv.t;
const CODE: string = process.env.OZ_CODE || argv.c;
const _sub = new Subject<ISub>();
const _unsub = new Subject<IUnsub>();
const _pub = new Subject<IPublishMsg>();
const opts:IClientOptions = {
  clientId: 'open-zone', // this will retain topic subscriptions on observable resubscribes
  will: { topic: `${TOPIC}/LWT`, payload: 'Offline', qos:0, retain: true }
};
if (process.env.OZ_MQTT_USERNAME || argv.mu) {
  opts.username = process.env.OZ_MQTT_USERNAME || argv.mqttUsername as string;
  opts.password = process.env.OZ_MQTT_PASSWORD || argv.mqttPassword as string;
}
const mqtt$ = createMessageStream(brokerUrl, _sub, _unsub, _pub, opts,
  (packet) => {
    _pub.next({topic:`${TOPIC}/LWT`, payload:'Online', opts: {retain:true}});
    _pub.next({topic:`${TOPIC}/STATE`, payload:JSON.stringify({started:Date.now()}), opts: {retain:true}});
  }
).pipe(
  retry({
    delay(error, retryCount){
      logger(error);
      const t = (retryCount + 2) * 2000;
      logger?.(`MQTT connection error. Reconnecting in ${t}.`);
      return timer(t).pipe(tap({
        next(){ logger?.('MQTT reconnecting...'); }
      }));
    },
    resetOnSuccess: true
  }),
  repeat({
    delay(count){
      const t = (count + 2) * 5000;
      logger?.(`MQTT connection closed. Reconnecting in ${t}.`);
      return timer(t).pipe(tap({
        next(){ logger?.('MQTT reconnecting...'); }
      }));
    },
  }),
  interest(`cmnd/${TOPIC}/partition/+`, _sub, _unsub, (msg) => {
    const partition = +msg.topic.split('/').pop()!;
    switch (msg.payload.toString()) {
      case PartitionCommand.ArmStay:
        commandStreamToEnvisalink.next([ApplicationCommand.PartitionArmControlStayArm,partition.toString()]);
        break;
      case PartitionCommand.Arm:
        commandStreamToEnvisalink.next([ApplicationCommand.PartitionArmControl,partition.toString()]);
        break;
      case PartitionCommand.Disarm:
        commandStreamToEnvisalink.next([ApplicationCommand.PartitionDisarmControl,`${partition}${CODE}`]);
        break;
    }
  }),
  interest(`cmnd/${TOPIC}/panic`, _sub, _unsub, (msg) => {
    switch (msg.payload.toString()) {
      case PanicType.Fire:
        commandStreamToEnvisalink.next([ApplicationCommand.TriggerPanicAlarm, '1'])
        break;
      case PanicType.Ambulance:
        commandStreamToEnvisalink.next([ApplicationCommand.TriggerPanicAlarm, '2'])
        break;
      case PanicType.Police:
        commandStreamToEnvisalink.next([ApplicationCommand.TriggerPanicAlarm, '3'])
        break;
    }
  }),
);


// setup stdout (fake MQTT)
const fakeMsg$ = new Subject<IMsg>();
const mqttFake$ = createMessageStreamDebug(brokerUrl, _sub, _unsub, _pub, fakeMsg$);


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
        topic: `${TOPIC}/zone/${key}`,
        payload: JSON.stringify(state),
        opts: { retain: true },
      })
    }
  }),
  handleCmdPartitionState((partition,state) => {
    const id = +partition;
    _pub.next({
      topic: `${TOPIC}/partition/${id}`,
      payload: JSON.stringify({ id, state, since: Date.now() }),
      opts: { retain: true }
    });
  }),
  handleCmdLogin(commandStreamToEnvisalink, envisaLinkPass, () => {
    // 1. login complete -> now get the durations that zones have been restored
    commandStreamToEnvisalink.next([ApplicationCommand.DumpZoneTimers,'']);
  }, () => {
    console.log('Login failed...')
  }),
  handleCmdKeypadLEDState((led,state) => {
    _pub.next({
      topic: `${TOPIC}/indicator/${led}`,
      payload: JSON.stringify({ id: led, state, since: Date.now()}),
      opts: { retain: true }
    });
  }),
  handleCmdReaction((ackcmd) => {
    console.debug('EnvisaLink acknowledged command', ackcmd)
  }),
  handleCmdTrouble((led,state) => {
    _pub.next({
      topic: `${TOPIC}/trouble/${led}`,
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
        topic: `${TOPIC}/zone/${zone}`,
        payload: JSON.stringify(state),
        opts: { retain: true }
      })
    });
    // 2. got timers -> now request a report of all states
    commandStreamToEnvisalink.next([ApplicationCommand.StatusReport,'']);
  }),
  handleCmdSystemError((payload) => _pub.next({ topic: `${TOPIC}/error`, payload })),
);


let sub:Subscription;
if (argv._.includes('mqtt')) {// MQTT BRIDGE
  sub = $.subscribe({
    next(unhandled) {
      console.log('Unhandled command:', unhandled);
    },
    error(er) {
      console.error(er);
    }
  });
  sub.add(mqtt$.subscribe({
    next({topic, payload, packet}){ console.log('message', topic, payload.toString()); },
    error(error){ console.warn('MQTT Stream error.', error); },
  }));
} else if (argv._.includes('log')) { // STDOUT LOGGER
  sub = $.subscribe({
    next(unhandled) {
      console.log('Unhandled command:', unhandled);
    },
    error(er) {
      console.error(er);
    },
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

