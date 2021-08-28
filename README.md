# open-zone
Eyezon EnvisaLink bridge

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

# Package dependencies

`yargs` to assist with CLI parameters.
`rxjs` as events will steam thick and fast. Observables will be a useful building block.

# EnvisaLink TPI documentation

The third party inreface documentation (v1.08) can be found in [this EyezOn forum thread](http://forum.eyez-on.com/FORUM/viewtopic.php?t=301).