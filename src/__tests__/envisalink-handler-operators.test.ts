import { of } from "rxjs";
import {
  handleCmdKeypadLEDState,
  handleCmdLogin,
  handleCmdPartitionState,
  handleCmdReaction,
  handleCmdSystemError,
  handleCmdTimeBroadcast,
  handleCmdTrouble,
  handleCmdZoneState,
  handleCmdZoneTimerDump,
} from "../envisalink";

type MSG = [string,string];

test('Command reactions', done => {
  let test1: string, test2: string, test3: string;
  of(['500','000'] as MSG, ['501',''] as MSG, ['000',''] as MSG).pipe(
    handleCmdReaction((cmd) => test1 = `ack ${cmd}`, () => test2 = 'checksum error'),
  ).subscribe({
    next([cmd,data]) { test3 = `passthrough ${cmd} ${data}` },
    error(er) { done(er) },
    complete() {
      expect(test1).toBe('ack 000');
      expect(test2).toBe('checksum error');
      expect(test3).toBe('passthrough 000 ');
      done();
    },
  });
});

test('Command: system error', done => {
  let test1: string, test2: string;
  of(['502','013'] as MSG, ['000',''] as MSG).pipe(
    handleCmdSystemError((er) => test1 = `error ${er}`),
  ).subscribe({
    next([cmd,data]) { test2 = `passthrough ${cmd} ${data}` },
    error(er) { done(er) },
    complete() {
      expect(test1).toBe('error 013');
      expect(test2).toBe('passthrough 000 ');
      done();
    },
  });
});

test('Command: login process', done => {
  let test1: string, test2: string, test3: string[] = [], test4: string;
  const responder = {
    next(msg:MSG) { test3.push(`login ${msg.join(' ')}`)}
  }
  of(['505','0'] as MSG, ['505','1'] as MSG, ['505','2'] as MSG, ['505','3'] as MSG, ['000',''] as MSG).pipe(
    handleCmdLogin(responder, 'P@ss9!', () => test2 = 'success', () => test1 = `failed`),
  ).subscribe({
    next([cmd,data]) { test4 = `passthrough ${cmd} ${data}` },
    error(er) { done(er) },
    complete() {
      expect(test1).toBe('failed');
      expect(test2).toBe('success');
      expect(test3[0]).toBe('login 005 P@ss9!');
      expect(test3[1]).toBe('login 005 P@ss9!');
      expect(test4).toBe('passthrough 000 ');
      done();
    },
  });
});

test('Command: keypad LED states', done => {
  let tests: string[] = [], test: string;
  const data = 0b01000000.toString(16); // fire LED
  of(['511', data] as MSG, ['510',data] as MSG, ['511', '00'] as MSG, ['510', '00'] as MSG, ['000',''] as MSG).pipe(
    handleCmdKeypadLEDState((led,state) => tests.push(`led ${led} ${state}`)),
  ).subscribe({
    next([cmd,data]) { test = `passthrough ${cmd} ${data}` },
    error(er) { done(er) },
    complete() {
      expect(tests[0]).toBe('led 6 2');
      expect(tests[1]).toBe('led 6 2');
      expect(tests[2]).toBe('led 6 1');
      expect(tests[3]).toBe('led 6 0');
      expect(test).toBe('passthrough 000 ');
      done();
    },
  });
});

test('Command: time broadcast', done => {
  let test1: string, test2: string;
  of(['550', '1645022020'] as MSG, ['000',''] as MSG).pipe(
    handleCmdTimeBroadcast((date) => test1 = date.toISOString()),
  ).subscribe({
    next([cmd,data]) { test2 = `passthrough ${cmd} ${data}` },
    error(er) { done(er) },
    complete() {
      expect(test1).toBe('2020-02-20T14:45:00.000Z');
      expect(test2).toBe('passthrough 000 ');
      done();
    },
  });
});

test('Command: zone state changes', done => {
  let tests: string[] = [], test: string;
  of(
    ['601', '1001'] as MSG,
    ['602', '1001'] as MSG,
    ['603', '1001'] as MSG,
    ['604', '1001'] as MSG,
    ['605', '001'] as MSG,
    ['606', '001'] as MSG,
    ['609', '001'] as MSG,
    ['610', '001'] as MSG,
    ['000',''] as MSG
  ).pipe(
    handleCmdZoneState((z,restored,situation,p) => tests.push(`${z} ${restored?'x':'o'} ${situation} ${p?p:''}`)),
  ).subscribe({
    next([cmd,data]) { test = `passthrough ${cmd} ${data}` },
    error(er) { done(er) },
    complete() {
      expect(tests[0]).toBe('001 o alarm 1');
      expect(tests[1]).toBe('001 x alarm 1');
      expect(tests[2]).toBe('001 o tamper 1');
      expect(tests[3]).toBe('001 x tamper 1');
      expect(tests[4]).toBe('001 o fault ');
      expect(tests[5]).toBe('001 x fault ');
      expect(tests[6]).toBe('001 o normal ');
      expect(tests[7]).toBe('001 x normal ');
      expect(test).toBe('passthrough 000 ');
      done();
    },
  });
});

test('Command: time broadcast', done => {
  let tests: string[], test: string;
  of(['615', 'FFFF00FFDFB10000'] as MSG, ['000',''] as MSG).pipe(
    handleCmdZoneTimerDump((timers) => tests = timers.map(
      ({zone,restored,maxed,duration}) => `${zone} ${restored?'x':'o'} ${maxed?'x':'o'} ${duration}`
    )),
  ).subscribe({
    next([cmd,data]) { test = `passthrough ${cmd} ${data}` },
    error(er) { done(er) },
    complete() {
      expect(tests[0]).toBe('1 o o 0');
      expect(tests[1]).toBe('2 x o 1275');
      expect(tests[2]).toBe('3 x o 100000');
      expect(tests[3]).toBe('4 x x 327675');
      expect(test).toBe('passthrough 000 ');
      done();
    },
  });
});

test('Command: partition state changes', done => {
  let tests: string[] = [], test: string;
  of(
    ['650', '1'] as MSG,
    ['651', '1'] as MSG,
    ['652', '13'] as MSG,
    ['653', '1'] as MSG,
    ['654', '1'] as MSG,
    ['655', '1'] as MSG,
    ['656', '1'] as MSG,
    ['657', '1'] as MSG,
    ['659', '1'] as MSG,
    ['672', '1'] as MSG,
    ['673', '1'] as MSG,
    ['674', '1'] as MSG,
    ['000',''] as MSG,
  ).pipe(
    handleCmdPartitionState((partition,state) => tests.push(`${partition} ${state}`)),
  ).subscribe({
    next([cmd,data]) { test = `passthrough ${cmd} ${data}` },
    error(er) { done(er) },
    complete() {
      expect(tests[0]).toBe('1 ready');
      expect(tests[1]).toBe('1 not-ready');
      expect(tests[2]).toBe('1 armed-ze-stay');
      expect(tests[3]).toBe('1 ready-fa');
      expect(tests[4]).toBe('1 alarm');
      expect(tests[5]).toBe('1 disarmed');
      expect(tests[6]).toBe('1 exit-delay');
      expect(tests[7]).toBe('1 entry-delay');
      expect(tests[8]).toBe('1 arm-failed');
      expect(tests[9]).toBe('1 arm-failed');
      expect(tests[10]).toBe('1 busy');
      expect(tests[11]).toBe('1 arming');
      expect(test).toBe('passthrough 000 ');
      done();
    },
  });
});

test('Command: trouble indicators', done => {
  let tests: string[] = [], test: string;
  const data = 0b01010000.toString(16); // Low battery and fault
  of(['849', data] as MSG, ['840', data] as MSG, ['841', data] as MSG, ['000',''] as MSG).pipe(
    handleCmdTrouble((states) => tests.push(states.map(on => on?'on':'.').join(''))),
  ).subscribe({
    next([cmd,data]) { test = `passthrough ${cmd} ${data}` },
    error(er) { done(er) },
    complete() {
      expect(tests[0]).toBe('....on.on.');
      expect(test).toBe('passthrough 000 ');
      done();
    },
  });
});
