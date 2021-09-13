# open-zone

An EyezOn EnvisaLink-MQTT bridge. See the [npm](https://www.npmjs.com/package/@binaryme/open-zone) package.

The [EnvisaLink™ EVL-4EZR](https://www.eyezon.com/evl4.php) interface module.

An app that received commands from the EnvisaLink module and publishes states to and MQTT server.

# CLI

```
Usage: open-zone <command> [options]

Commands:
  mqtt      communicates EnvisaLink commands to MQTT
  log       prints MQTT-destined traffic to stdout instead

Options:
  -h, --host <value>    the host of the module (default: localhost)
  -p, --port <value>    the module TCP port number (default: 4025)
  -s, --pass <value>    the password to authenticate with after the TCP
connection is established (default: user)
  -c, --code <value>    the keypad code used to disarm (default: 1234)
  -u, --url <value>     the MQTT broker URL (default: mqtt://localhost)
  -t, --topic <value>   the MQTT topic for publishing states (default:
open-zone)
```

Environment variables may also be used to set any of the options prepended with `OZ_`.

Example: `OZ_PASS=user open-zone mqtt -h 192.168.0.3 -u mqtt://192.168.0.2`;

A config file named `.open-zone-config.json` may also be used.

Example:
```JSON
{
  "pass": "user",
  "code": 1234
}
```

## MQTT messages

Zone states are published to `tele/[topic]/zone/[zone#]` (and retained) as JSON with the following properties.
```js
{
  "id": 1, /* the zone number */
  "situation": "normal", /* | `alarm` | `tamper` | `fault` */
  "restored": true, /* the zone is either open or restored. See TPI
  commands 601 - 610 in the documentation. */
  "since": 1630748000000, /* epoch milli seconds since the last state
  change was published */
  "partition": "1" /* when the zone is part of an armed partition the
  situations `alarm` and `tamper` will be acompanied by a partition
  number */
}
```
Partition states are published to `tele/[topic]/partition/[partition#]` (and retained) as JSON with the following properties.
```js
{
  "id": 1, /* the partition number */
  "state": "", /* `PartitionActivityType`See TPI commands 650 - 659 in the
  documentation */
  "since": 1630748000000 /* epoch milli seconds since the last state
  change was published */
}
```
Keypad LEDs are published to `tele/[topic]/indicator/[indicator#]` (and retained) as JSON with the following properties.
```js
{
  "id": 0, /* LED index (0-7) as described in the documentation about TPI
  command 510 */
  "state": 0, /* 0=OFF, 1=ON, 2=FLASHING */
  "since": 1630748000000, /* epoch milli seconds since the last state change
  was published */
}
```
Troubles are published to `tele/[topic]/trouble/[trouble#]` (and retained) as JSON with the following properties.
```js
{
  "id": 0, /* trouble index (0-7) as described in the documentation about
  TPI command 849 */
  "state": false, /* true if the trouble is active and needs attention */
  "since": 1630748000000, /* epoch milli seconds since the last state
  change was published */
}
```
Any error codes (TPI command 502) are published to `tele/[topic]/error` as `SystemErrorCode` (string).

Partition instructions are read from `cmnd/[topic]/partition/[parition#]`. The message payload can be either `arm`, `arm-stay` or `disarm`. The latter requires the `code` argument.

Panic instructions are read from `cmnd/[topic]/panic`. The message payload can be either `fire`, `ambulance` or `police`.

# Get started

```JavaScript
const port: number = 4025; // default
const host: string = '192.168.0.10'; // IP of your EnvisaLink
const envisaLinkPass: 'user'; // EnvisaLink TPI password

// create a subject used to send command back to the EnvisaLink TPI
const commandStreamToEnvisalink = new Subject<[string,string]>();

// callback for when login to the EnvisaLink TPI was successful
const onEnvisaLinkReady = () => {
  commandStreamToEnvisalink.next([ApplicationCommand.DumpZoneTimers,'']);
  commandStreamToEnvisalink.next([ApplicationCommand.StatusReport,'']);
}

// create the TCP socket and make an observable to stream to incoming commands
const commandStreamFromEnvisaLink$ = createCommandStream(commandStreamToEnvisalink, host, port);

// modify the command stream as you please
const commandStream$ = commandStreamFromEnvisaLink$.pipe(
  // optional out-of-the-box operator to assist with the login process
  handleCmdLogin(commandStreamToEnvisalink, envisaLinkPass, onEnvisaLinkReady),
  // it would be a good idea to multicast
  shareReplay(),
);

commandStream$
  .pipe(
    filter(([command,data]:[string,string]) => command === TPICommand.PartitionInAlarm),
  )
  .subscribe(([command,data]:[string,string]) => {
    console.log(`Partition ${data} is in alarm!`);
  });
```

The CLI is of course a comprehensive example.

# Roadmap

* ~~Communicate zone and partition statuses~~ ✅
* ~~Communicate trouble indicators~~ ✅
* ~~Communicate keypad indicators~~ ✅
* ~~Act on partition command (arming and panic)~~ ✅
* ~~Move sensative CLI args to environment variables~~ ✅
* ~~Optional CLI config file~~ ✅
* Provide options to connect to MQTT using a username and password

# Package dependencies

`mqtt` for easy interaction with an MQTT broker

`yargs` to assist with CLI parameters.

`rxjs` as events will steam thick and fast. Observables will be a useful building block.

# EnvisaLink TPI documentation

The third party inreface documentation (v1.08) can be found in [this EyezOn forum thread](http://forum.eyez-on.com/FORUM/viewtopic.php?t=301).