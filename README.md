# open-zone

Eyezon EnvisaLink bridge

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

# Purpose

A bridge server that passes commands between an EnvisaLink TPI (third party interface) and an MQTT server.

# Roadmap

* Convey zone and partition statuses
* Convey trouble indicators
* Convey keypad indicators
* Act on partition command (arming and panic)
* Export functionality that can be used by other developers
* Provide options to pass MQTT username and password
* Move sensative CLI args to environment variables
* Optional CLI config file

# Package dependencies

`mqtt` for easy access to IoT state
`yargs` to assist with CLI parameters.
`rxjs` as events will steam thick and fast. Observables will be a useful building block.

# EnvisaLink TPI documentation

The third party inreface documentation (v1.08) can be found in [this EyezOn forum thread](http://forum.eyez-on.com/FORUM/viewtopic.php?t=301).