import { Observable, shareReplay, Subject } from "rxjs";
import {
  IClientOptions,
  connect as _connect,
  IClientPublishOptions,
  IPublishPacket
} from "mqtt";

export interface IMsg {
  topic: string;
  payload: Buffer;
  packet: IPublishPacket;
}
export interface IPublishMsg {
  topic: string;
  payload: string | Buffer;
  opts?: IClientPublishOptions;
};

/**
 * Create a client connection to an MQTT broker, manage subscriptions and publications to
 * the client and returns a message stream. The MQTT client automatically reconnects on
 * disconnect and maintains subscriptions (becuase of client identification).
 * @param url The broker URL. Eg: mqtt://localhost
 * @param sub Topic interests (subscribe) as a stream
 * @param unsub Topic disinterests (unsubscribe) as a stream
 * @param pub Message (to be published) as a stream
 * @param opts MQTT client connection options
 * @returns An stream of MQTT messages
 */
export function connect(
  url: string,
  sub: Observable<string | string[]>,
  unsub: Observable<string | string[]>,
  pub: Observable<IPublishMsg>,
  options?: IClientOptions,
) {
  return new Observable<IMsg>(subscriber => {
    const mqtt = _connect(url, options);
    mqtt.on('message', (topic,payload,packet) => subscriber.next({topic,payload,packet}));
    mqtt.on('connect', (packet) => console.debug('connect', packet));
    // mqtt.on('error', (error) => subscriber.error(error));
    mqtt.on('error', (error) => console.warn(error));
    // mqtt.on('close', () => subscriber.complete());
    mqtt.on('close', () => console.info('MQTT connection close'));

    const s = pub.subscribe(({topic,payload,opts}) => {
      opts ? mqtt.publish(topic,payload,opts) : mqtt.publish(topic,payload);
    });
    s.add(sub.subscribe(topics => mqtt.subscribe(topics)));
    s.add(unsub.subscribe(topics => mqtt.unsubscribe(topics)));

    return () => {
      s.unsubscribe();
      mqtt.end()
    }
  });
};

export function connectDebug(
  url: string,
  sub: Observable<string | string[]>,
  unsub: Observable<string | string[]>,
  pub: Observable<IPublishMsg>,
  fakeMsg$: Observable<IMsg>,
) {
  return new Observable<IMsg>(subscriber => {
    console.debug(`CONNECT: ${url}`);
    const s = fakeMsg$.subscribe(msg => subscriber.next(msg));
    s.add(pub.subscribe(({topic,payload}) => console.debug(`PUBLISH: [${topic}] ${payload}`)));
    s.add(sub.subscribe(topics => console.debug(`SUB: ${topics.toString()}`)));
    s.add(unsub.subscribe(topics => console.debug(`UNS: ${topics.toString()}`)));
    return () => {
      s.unsubscribe();
    }
  })
}

/**
 * Creates an operator that (un)subscribes to topic interests and filters MQTT messages accordingly.
 * @param topic MQTT topic interests
 * @param sub Subject to notify the start of topic intrests
 * @param unsub Subject to notify the end of topic interets
 * @returns An operator
 */
export function interest(
  topic: string | string[],
  sub: { next:(topics: string | string[]) => void },
  unsub: { next:(topics: string | string[]) => void },
) {
  return ($:Observable<IMsg>):Observable<IMsg> => {
    return new Observable(subscriber => {
      const qualifiers = typeof(topic) === 'string'? [topic] : topic;
      sub.next(topic);
      const _ = $.subscribe({
        next(msg){
          const qualified = qualifiers.find(qualifier => topicQualifier(msg.topic, qualifier));
          if (qualified) subscriber.next(msg);
        },
        error(er) { subscriber.error(er) },
        complete() { subscriber.complete() },
      });
      _.add(() => unsub.next(topic));
      return _;
    })
  }
}

/**
 * Check if an MQTT message is an interest of a subscriber by comparing the message topic and subscription topic 
 * @param subject The MQTT topic of a message
 * @param specification A topic subscription to compare with the subject
 * @returns `true` if the subject fits the specification
 */
export function topicQualifier(subject:string, specification:string):boolean {
  const qualifiers = specification.split('/');
  const actuals = subject.split('/');
  for (let i = 0; i<actuals.length; i++) {
    if (qualifiers.length <= i) return false; // remaining actuals won't qualify
    const q = qualifiers[i];
    const a = actuals[i];
    if (q === a) continue; // segment qualifies - continue testing next segment
    if (q === '#') return true; // remaining actuals qualify
    if (q === '+') {
      if (actuals.length === qualifiers.length) return true;
      continue; // segment qualifies - continue testing next segment
    }
    return false; // actual does not qualify
  }
  return actuals.length === qualifiers.length; // remaining qualifiers are not met
}