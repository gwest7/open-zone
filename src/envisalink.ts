import { connect } from 'net';
import { Observable, retryWhen, tap, delay, repeatWhen, Subject, map, shareReplay } from 'rxjs';
import { ApplicationCommand, DataLoginResponse, PartitionActivityType, SystemErrorCode, TPICommand, ZoneActivityType } from './constants';
import { Boolean8X, getBitStates, getChecksum } from './utils';

/**
 * Create an observable of command coming from the EnvisaLink TPI.
 * @param host Host name of the EnvisaLink TPI.
 * @param port Port of the Envisalink TPI host.
 * @param in$ The stream of commands going to the EnvisaLink TPI. Values are normally 
 * `[command][data]`. The checksum is added automatically.
 */
export function connect$(
  in$: Observable<string>,
  host: string,
  port: number,
):Observable<string> {
  return new Observable(subscriber => {
    console.log('connect',port,host)
    const con = connect(port, host, () => {
      con.on('data', (data:string) => subscriber.next(data));
      con.on('error', (er) => {
        // if the socket connection errors then error the observable so that a retry can be done
        // console.log("Enviaslink socket error",er);
        subscriber.error(er);
      });
      con.on('close', () => {
        // if the socket connection closes then complete the observable so that a repeat can be done
        // console.log('Socket close');
        subscriber.complete();
      });
    });
    con.setEncoding('utf8'); // "All data is sent as hex ASCII codes."
    const subIn = in$.subscribe({
      next(payload) {
        // "CCC DDD…DDD CKS CR/LF"
        con.write(`${payload}${getChecksum(payload)}\r\n`);
      },
      error(er) { con.destroy(er) },
      complete() { con.destroy() },
    })
    return () => {
      subIn.unsubscribe();
      con.destroy();
    }
  });
};

/**
 * Create an operator to reconnect a failed EnvisaLink connection
 * @param delayMs Retry delay after failure
 * @returns Operator
 */
export function retryOnError(delayMs = 9000, logger?:(msg:string)=>void) {
  return retryWhen<string>(er$ => er$.pipe(
    tap((er) => logger?.("Envisalink socket error. Waiting 9s...")),
    delay(delayMs),
    tap(() => logger?.("Reconnecting Envisalink socket after error..."))
  ))
}

/**
 * Create an operator to reconnect a closed EnvisaLink connection
 * @param delayMs Retry delay after closure
 * @returns Operator
 */
export function repeatOnComplete(delayMs = 6000, logger?:(msg:string)=>void) {
  return repeatWhen<string>($ => $.pipe(
    tap(() => logger?.("Envisalink socket closed. Waiting 6s...")),
    delay(delayMs),
    tap(() => logger?.("Reconnecting Envisalink socket after close..."))
  ))
}

/**
 * The string payloads can sometimes contain more than on command. This operator splits
 * these into multiple values for the observable. It also does a checksum test and
 * separates the command from the data before passing the value down the stream.
 * @param onInvalidCommand A callback to report invalid commands received
 * @returns Operator
 */
export function cleanStream<Command extends string, Data extends string>(
  onInvalidCommand?: (command:string,error:string) => void
){
  return ($:Observable<string>):Observable<[Command,Data]> => {
    return new Observable(subscriber => {
      return $.subscribe({
        next(msg){
          // Length check
          const commands = msg.split("\r\n"); // CCC DDD…DDD CKS CR/LF
          commands.pop(); // get rid of last empty command value (following LF terminator)
          commands.forEach(com => {
            if (com.length < 5) {
              onInvalidCommand?.(com,`Too short`);
              return; // ignore message
            }

            // checksum test
            const payload = com.substring(0, com.length - 2);
            const checksum = com.substring(com.length - 2);
            if (getChecksum(payload) !== checksum) {
              onInvalidCommand?.(com,`Invalid checksum: ${checksum}`);
              return; // ignore message
            }

            // next
            const command = payload.substring(0, 3) as Command;
            const data = (payload.length > 3 ? payload.substring(3) : '') as Data;
            subscriber.next([command, data])
          });
        },
        error(er) { subscriber.error(er) },
        complete() { subscriber.complete() },
      })
    })
  }
}

export function createCommandStream(
  inputCommandStream$: Observable<[string,string]>,
  host: string,
  port: number,
  logger?: (msg:string) => void,
) {
  const to$ = inputCommandStream$.pipe(map(([cmd,data]) => `${cmd}${data}`));
  const con$ = connect$(to$, host, port);
  return con$.pipe(
    retryOnError(9000,logger),
    repeatOnComplete(6000,logger),
    cleanStream((cmd,er) => logger?.(`[${cmd}] ${er}`)),
    shareReplay(), // crutial to avoid multiple connections
  );
}

/**
 * Creates an operator to handle command acknowledgements and checksum errors from the EnvisaLink
 * @param onAck Callback function to handle command acknowledgements
 * @param onChecksumError Callback function to handle command checksum errors
 * @returns Operator
 */
export function handleCmdReaction(
  onAck?: (acknowledgedCommand:string) => void,
  onChecksumError?: () => void,
) {
  return ($:Observable<[string,string]>):Observable<[string,string]> => {
    return new Observable(subscriber => {
      return $.subscribe({
        next([cmd,data]){
          switch (cmd) {
            case TPICommand.CommandAcknowledge:
              onAck?.(data);
              break;
            case TPICommand.CommandError:
              onChecksumError?.();
              break;
            default:
              subscriber.next([cmd, data]); // pass the command on
              break;
          }
        },
        error(er) { subscriber.error(er) },
        complete() { subscriber.complete() },
      })
    })
  }
}

/**
 * Creates an operator to handle system error commands from the EnvisaLink
 * @param cb Callback function to handle the command
 * @returns Operator
 */
 export function handleCmdSystemError(
  cb?: (error:SystemErrorCode) => void,
) {
  return ($:Observable<[string,string]>):Observable<[string,string]> => {
    return new Observable(subscriber => {
      return $.subscribe({
        next([cmd,data]){
          switch (cmd) {
            case TPICommand.SystemError:
              cb?.(data as SystemErrorCode);
              break;
            default:
              subscriber.next([cmd, data]); // pass the command on
              break;
          }
        },
        error(er) { subscriber.error(er) },
        complete() { subscriber.complete() },
      })
    })
  }
}

/**
 * Creates an operator to handle login commands from the EnvisaLink
 * @param responder The stream use to send command to the EnvisaLink
 * @param password The EnvisaLink TPI password
 * @param onLoginSuccess Callback for a successful login
 * @param onLoginFail Callback for a failed login
 * @param logger Callback to detail more information
 * @returns Operator
 */
export function handleCmdLogin(
  responder: {next:(msg:[string,string])=>void},
  password: string,
  onLoginSuccess?: () => void,
  onLoginFail?: () => void,
  logger?: (error:string) => void,
) {
  return ($:Observable<[string,string]>):Observable<[string,string]> => {
    return new Observable(subscriber => {
      return $.subscribe({
        next([cmd,data]){
          if (cmd !== TPICommand.LoginResponse) {
            return subscriber.next([cmd, data]); // pass the command on
          }
          const state = data as DataLoginResponse
          switch (state) {
            case DataLoginResponse.Fail: {
              logger?.("Login Failed.");
              // TODO: retry login when a new password is set?
              onLoginFail?.();
            } break;
            case DataLoginResponse.Success: {
              logger?.("Login Successful.");
              onLoginSuccess?.();
            } break;
            case DataLoginResponse.Timeout: {
              logger?.("Login Timeout.");
              responder.next([ApplicationCommand.NetworkLogin, password]);
            } break;
            case DataLoginResponse.Required: {
              logger?.("Sending Login...");
              responder.next([ApplicationCommand.NetworkLogin, password]);
            } break;
            default: {
              logger?.(`Unknown Login Response state: ${state}`);
            } break;
          }
        },
        error(er) { subscriber.error(er) },
        complete() { subscriber.complete() },
      })
    })
  }
}

/**
 * Creates an operator to handle keypad LED state change commands from the EnvisaLink
 * @param cb Callback function to handle the LED state updates. `led` is the LED index.
 * `state` one of `0`, `1` or `2` meaning `off`, `on` or `flashing` respectively.
 * @returns Operator
 */
 export function handleCmdKeypadLEDState(
  cb?: (led:number,state:0|1|2) => void,
) {
  const ON:Boolean8X = [false, false, false, false, false, false, false, false];
  const BLINK:Boolean8X = [false, false, false, false, false, false, false, false];
  return ($:Observable<[string,string]>):Observable<[string,string]> => {
    return new Observable(subscriber => {
      return $.subscribe({
        next([cmd,data]){
          if (cmd !== TPICommand.KeypadLEDState && cmd !== TPICommand.KeypadLEDFlashState) {
            return subscriber.next([cmd, data]); // pass the command on
          }
          const leds = getBitStates(data);
          let states:Boolean8X;
          switch (cmd) {
            case TPICommand.KeypadLEDState:
              states = ON;
              break;
            case TPICommand.KeypadLEDFlashState:
              states = BLINK;
              break;
          }
          for (let i=0; i<=8; i++) if (states[i] !== leds[i]){
            states[i] = leds[i];
            cb?.(i, BLINK[i] ? 2 : ON[i] ? 1 : 0);
          }
        },
        error(er) { subscriber.error(er) },
        complete() { subscriber.complete() },
      })
    })
  }
}

/**
 * Creates an operator to handle time broadcast commands from the EnvisaLink
 * @param cb Callback function to handle the command
 * @returns Operator
 */
 export function handleCmdTimeBroadcast(
  cb?: (date:Date) => void,
) {
  return ($:Observable<[string,string]>):Observable<[string,string]> => {
    return new Observable(subscriber => {
      return $.subscribe({
        next([cmd,data]){
          switch (cmd) {
            case TPICommand.TimeDateBroadcast: {
              const t:number[] = [];
              for (let i = 0; i<10; i+=2) t.push(+data.substring(i,i+2));
              const [h,m,M,d,y] = t;
              cb?.(new Date(2000+y, M-1, d, h, m));
            } break;
            default:
              subscriber.next([cmd, data]); // pass the command on
              break;
          }
        },
        error(er) { subscriber.error(er) },
        complete() { subscriber.complete() },
      })
    })
  }
}

/**
 * Creates an operator to handle commands with zone state changes from the EnvisaLink
 * @param cb Callback function to handle the command
 * @returns Operator
 */
 export function handleCmdZoneState(
  cb?: (zone:string,restored:boolean,situation:ZoneActivityType,partition?:string) => void,
) {
  return ($:Observable<[string,string]>):Observable<[string,string]> => {
    return new Observable(subscriber => {
      return $.subscribe({
        next([cmd,data]){
          switch (cmd) {
            case TPICommand.ZoneOpen: {
              cb?.(data.substring(0,3), false, ZoneActivityType.Normal);
            } break;
            case TPICommand.ZoneRestored: {
              cb?.(data.substring(0,3), true, ZoneActivityType.Normal);
            } break;
            case TPICommand.ZoneFault: {
              cb?.(data.substring(0,3), false, ZoneActivityType.Fault);
            } break;
            case TPICommand.ZoneFaultRestored: {
              cb?.(data.substring(0,3), true, ZoneActivityType.Fault);
            } break;
            case TPICommand.ZoneAlarm: {
              cb?.(data.substring(1,4), false, ZoneActivityType.Alarm, data.substring(0,1));
            } break;
            case TPICommand.ZoneAlarmRestored: {
              cb?.(data.substring(1,4), true, ZoneActivityType.Alarm, data.substring(0,1));
            } break;
            case TPICommand.ZoneTamper: {
              cb?.(data.substring(1,4), false, ZoneActivityType.Tamper, data.substring(0,1));
            } break;
            case TPICommand.ZoneTamperRestored: {
              cb?.(data.substring(1,4), true, ZoneActivityType.Tamper, data.substring(0,1));
            } break;
            default:
              subscriber.next([cmd, data]); // pass the command on
              break;
          }
        },
        error(er) { subscriber.error(er) },
        complete() { subscriber.complete() },
      })
    })
  }
}

/**
 * Creates an operator to handle zone timer dump commands from the EnvisaLink
 * @param cb Callback function to receive the zone timers. Each item in the array has
 * `zone`: the zone number, `restored`: zone is not open, `maxed`: the duration restored
 * is maxed beyond 91h and `duration` seconds the zone has been restored.
 * @returns Operator
 */
 export function handleCmdZoneTimerDump(
  cb?: (zoneTimes:{zone:number,restored:boolean,maxed:boolean,duration:number}[]) => void,
) {
  return ($:Observable<[string,string]>):Observable<[string,string]> => {
    return new Observable(subscriber => {
      return $.subscribe({
        next([cmd,data]){
          switch (cmd) {
            case TPICommand.ZoneTimerDump: {
              const zoneTimes:{zone:number,restored:boolean,maxed:boolean,duration:number}[] = [];
              let ticks: number; // 0xffff=open, 0x0=maxed
              let zone: number;
              for (let i = 0; i < data.length; i += 4) {
                ticks = parseInt(`${data.substring(i+2,i+4)}${data.substring(i,i+2)}`, 16);
                zone = i / 4 + 1;
                // if (isNaN(sec)) console.warn("isNaN", sval, data.substring(i + 2, i + 4));
                // console.log(z, sec, `${Math.floor(sec / 60)}m ${sec % 60}s`, new Date(Math.round(now - sec) * 1000).toLocaleTimeString());
                zoneTimes.push({
                  zone: i / 4 + 1,
                  duration: (0xffff - ticks) * 5,
                  restored: ticks !== 0xffff,
                  maxed: ticks === 0,
                });
              }
              cb?.(zoneTimes)
            } break;
            default:
              subscriber.next([cmd, data]); // pass the command on
              break;
          }
        },
        error(er) { subscriber.error(er) },
        complete() { subscriber.complete() },
      })
    })
  }
}

/**
 * Creates an operator to handle commands with partition status updates from the EnvisaLink
 * @param cb Callback function to handle the command
 * @returns Operator
 */
 export function handleCmdPartitionState(
  cb?: (partition:string,state:PartitionActivityType) => void,
) {
  return ($:Observable<[string,string]>):Observable<[string,string]> => {
    return new Observable(subscriber => {
      return $.subscribe({
        next([cmd,data]){
          switch (cmd) {
            case TPICommand.PartitionReady: {
              cb?.(data.substring(0,1), PartitionActivityType.Ready);
            } break;
            case TPICommand.PartitionNotReady: {
              cb?.(data.substring(0,1), PartitionActivityType.NotReady);
            } break;
            case TPICommand.PartitionArmed: {
              const type:PartitionActivityType = [
                PartitionActivityType.ArmedAway,
                PartitionActivityType.ArmedStay,
                PartitionActivityType.ArmedZeroEntryAway,
                PartitionActivityType.ArmedZeroEntryStay,
              ][+data.substring(1,2)];
              cb?.(data.substring(0,1), type);
            } break;
            case TPICommand.PartitionReadyForceArmingEnabled: {
              cb?.(data.substring(0,1), PartitionActivityType.ReadyForceArmingEnabled);
            } break;
            case TPICommand.PartitionInAlarm: {
              cb?.(data.substring(0,1), PartitionActivityType.Alarm);
            } break;
            case TPICommand.PartitionDisarmed: {
              cb?.(data.substring(0,1), PartitionActivityType.DisarmedAndReady);
            } break;
            case TPICommand.ExitDelayInProgress: {
              cb?.(data.substring(0,1), PartitionActivityType.ExitDelay);
            } break;
            case TPICommand.EntryDelayInProgress: {
              cb?.(data.substring(0,1), PartitionActivityType.EntryDelay);
            } break;
            case TPICommand.PartitionFailedToArm:
            case TPICommand.FailureToArm: {
              cb?.(data.substring(0,1), PartitionActivityType.ArmFailed);
            } break;
            case TPICommand.PartitionIsBusy: {
              cb?.(data.substring(0,1), PartitionActivityType.Busy);
            } break;
            case TPICommand.SystemArmingInProgress: {
              cb?.(data.substring(0,1), PartitionActivityType.Arming);
            } break;
            default:
              subscriber.next([cmd, data]); // pass the command on
              break;
          }
        },
        error(er) { subscriber.error(er) },
        complete() { subscriber.complete() },
      })
    })
  }
}

/**
 * Creates an operator to handle trouble commands from the EnvisaLink
 * @param cb Callback function to handle these updates
 * @returns Operator
 */
 export function handleCmdTrouble(
  cb?: (troubleLeds:Boolean8X) => void,
) {
  return ($:Observable<[string,string]>):Observable<[string,string]> => {
    return new Observable(subscriber => {
      return $.subscribe({
        next([cmd,data]){
          switch (cmd) {
            case TPICommand.VerboseTroubleStatus: {
              cb?.(getBitStates(data));
            } break;
            case TPICommand.TroubleLedOn: {
              // react on TPICommand.VerboseTroubleStatus
            } break;
            case TPICommand.TroubleLedOff: {
              cb?.([false,false,false,false,false,false,false,false]);
            } break;
            default:
              subscriber.next([cmd, data]); // pass the command on
              break;
          }
        },
        error(er) { subscriber.error(er) },
        complete() { subscriber.complete() },
      })
    })
  }
}

/**
 * Creates an operator to handle trouble commands from the EnvisaLink
 * @param logger Callback function to handle these updates
 * @returns Operator
 */
 export function handleCmd_future(
  logger?: (text:string) => void,
) {
  return ($:Observable<[string,string]>):Observable<[string,string]> => {
    return new Observable(subscriber => {
      return $.subscribe({
        next([cmd,data]){
          switch (cmd) {
            case TPICommand.BypassZonesBitfieldDump: {
              logger?.('Bypassed Zones Bitfield Dump');
            } break;
            case TPICommand.DuressAlarm: {
              logger?.('A duress code has been entered on a system keypad');
            } break;
            case TPICommand.KeyAlarmActivated: {
              logger?.('A Fire key alarm has been activated');
            } break;
            case TPICommand.KeyAlarmRestored: {
              logger?.('A Fire key alarm has been restored (sent automatically)');
            } break;
            case TPICommand.KeyAuxillaryActivated: {
              logger?.('An Auxillary key alarm has been activated');
            } break;
            case TPICommand.KeyAuxillaryRestored: {
              logger?.('An Auxillary key alarm has been restored (sent automatically)');
            } break;
            case TPICommand.KeyPanicActivated: {
              logger?.('A Panic key alarm has been activated');
            } break;
            case TPICommand.KeyPanicRestored: {
              logger?.('A Panic key alarm has been restored (sent automatically)');
            } break;
            case TPICommand.KeySmokeActivated: {
              logger?.('A 2-wire smoke/Auxiliary alarm has been activated');
            } break;
            case TPICommand.KeySmokeRestored: {
              logger?.('A 2-wire smoke/Auxiliary alarm has been restored');
            } break;
            case "658": logger?.(`Keypad Lock-out. Partition: ${data.substring(0,1)}`); break;
            case "660": logger?.(`PGM Output is in Progress. Partition: ${data.substring(0,1)}`); break;
            case "663": logger?.(`Chime Enabled. Partition: ${data.substring(0,1)}`); break;
            case "664": logger?.(`Chime Disabled. Partition: ${data.substring(0,1)}`); break;
            case "670": logger?.(`Invalid Access Code. Partition: ${data.substring(0,1)}`); break;
            case "671": logger?.(`Function Not Available. Partition: ${data.substring(0,1)}`); break;
            case "680": logger?.(`System in Installers Mode`); break;
            case "700": logger?.(`User Closing. Partition: ${data.substring(0,1)}, user: ${data.substring(1,5)}`); break;
            case "701": logger?.(`Special Closing. Partition: ${data.substring(0,1)}`); break;
            case "702": logger?.(`Partial Closing. Partition: ${data.substring(0,1)}`); break;
            case "750": logger?.(`User Opening. Partition: ${data.substring(0,1)}, user: ${data.substring(1,5)}`); break;
            case "751": logger?.(`Special Opening. Partition: ${data.substring(0,1)}`); break;
            case "800": logger?.(`Panel Battery Trouble`); break;
            case "801": logger?.(`Panel Battery Trouble Restore`); break;
            case "802": logger?.(`Panel AC Trouble`); break;
            case "803": logger?.(`Panel AC Restore`); break;
            case "806": logger?.(`System Bell Trouble`); break;
            case "807": logger?.(`System Bell Trouble Restored`); break;
            case "814": logger?.(`FTC Trouble - The panel has failed to communicate successfully to the monitoring station`); break;
            case "816": logger?.(`Buffer Near Full`); break;
            case "829": logger?.(`General System Tamper`); break;
            case "830": logger?.(`General System Tamper Restore`); break;
            case "842": logger?.(`Fire Trouble Alarm`); break;
            case "843": logger?.(`Fire Trouble Alarm Restore`); break;
            case "900": logger?.(`Code Required`); break;
            case "912": logger?.(`Command Output Pressed. Partition: ${data.substring(0,1)}, command: ${data.substring(1,2)}`); break;
            case "921": logger?.(`Master Code Required`); break;
            case "922": logger?.(`Installers Code Required`); break;
            default:
              subscriber.next([cmd, data]); // pass the command on
              break;
          }
        },
        error(er) { subscriber.error(er) },
        complete() { subscriber.complete() },
      })
    })
  }
}

