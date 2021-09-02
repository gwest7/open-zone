import { Subject } from 'rxjs';
import { IMsg, interest, topicQualifier } from '../mqtt';

test('Topic qualifier', () => {
  expect(topicQualifier('a/b/c','a/b/c/d')).toBe(false);
  expect(topicQualifier('a/b/c','a/b/c')).toBe(true);
  expect(topicQualifier('a/b/c','a/b')).toBe(false);
  expect(topicQualifier('a/b/c','a/+/c')).toBe(true);
  expect(topicQualifier('a/b/c/d','a/+/+')).toBe(false);
  expect(topicQualifier('a/b/c/d','a/+/+/#')).toBe(true);
  expect(topicQualifier('a/b/c/d/e','a/+/+/#')).toBe(true);
  expect(topicQualifier('a/b/c','a/+/+')).toBe(true);
  expect(topicQualifier('a/b','a/+/+')).toBe(false);
  expect(topicQualifier('a/b/c/d/e','a/+/+/d')).toBe(false);
  expect(topicQualifier('a/b/c/d/e','a/+/+/d/#')).toBe(true);
  expect(topicQualifier('a/b/c/d/e/f','a/+/+/d/#')).toBe(true);
  expect(topicQualifier('a/b/c/d','a/+/+/d')).toBe(true);
  expect(topicQualifier('a/b/c','a/+/+/d')).toBe(false);
  expect(topicQualifier('a/b/c/d','a/+/c/+')).toBe(true);
  expect(topicQualifier('a/b/c','+/b/c')).toBe(true);
  expect(topicQualifier('a/b','+/b/c')).toBe(false);
  
  expect(topicQualifier('a/b/c','a/b/#')).toBe(true);
  expect(topicQualifier('a/b/c','a/#')).toBe(true);
  expect(topicQualifier('a/b/c','#')).toBe(true);
  expect(topicQualifier('a/b/c','+/b/#')).toBe(true);
  expect(topicQualifier('a/b/c/d','+/b/#')).toBe(true);

  expect(topicQualifier('a/b/c','x/b/c')).toBe(false);
  expect(topicQualifier('a/b/c','a/x/c')).toBe(false);
  expect(topicQualifier('a/b/c','a/b/x')).toBe(false);
});

test('Interest operator', () => {
  const tests: string[] = [];
  const topic = ['a/b/7','a/b/3'];
  const msg$ = new Subject<IMsg>();
  const $ = msg$.pipe(interest(
    topic,
    { next(topics){ tests.push(`subscribed to ${topics.length} topics`) } },
    { next(topics){ tests.push(`unsubscribed ${topics.length} topics`) } },
  ));

  expect(tests.length).toBe(0);
  const sub = $.subscribe(({payload}) => tests.push(`received: ${payload.toString()}`));
  expect(tests.length).toBe(1);
  for (let i=0; i<9; i++) msg$.next({topic:`a/b/${i}`,payload:Buffer.from(`test ${i}`, "utf-8")} as any);
  expect(tests.length).toBe(3);
  sub.unsubscribe();
  expect(tests.length).toBe(4);

  expect(tests[0]).toBe('subscribed to 2 topics');
  expect(tests[1]).toBe('received: test 3');
  expect(tests[2]).toBe('received: test 7');
  expect(tests[3]).toBe('unsubscribed 2 topics');
})