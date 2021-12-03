import { EMPTY, of, switchMap, throwError } from 'rxjs';
import {
  repeatOnComplete,
  retryOnError,
  cleanStream,
} from '../index';

test('Retry on error pipe', done => {
  let failedFirst = false;
  of(true).pipe(
    switchMap((b) => {
      if (failedFirst) return of('success');
      failedFirst = true;
      return throwError(() => new Error('Simulated fail.'))
    }),
    retryOnError(100),
  ).subscribe({
    next(s) { expect(s).toBe('success') },
    error(er) { done(er) },
    complete() { done() },
  })
});

test('Repeat on completion pipe', done => {
  let completeFirst = false;
  const sub = of(true).pipe(
    switchMap((b) => {
      if (completeFirst) return of('success');
      completeFirst = true;
      return EMPTY;
    }),
    repeatOnComplete(100),
  ).subscribe({
    next(s) {
      expect(s).toBe('success');
      sub.unsubscribe();
      done();
    },
    error(er) { done(er) },
  })
});

test('Clean stream pipe: splitting', done => {
  of('6543D2\r\n').pipe(
    cleanStream(),
  ).subscribe({
    next([cmd,data]) {
      expect(cmd).toBe('654');
      expect(data).toBe('3')
    },
    error(er) { done(er) },
    complete() { done() },
  });
});

test('Clean stream pipe: "To short"', done => {
  let test: string;
  of('00\r\n').pipe(
    cleanStream((a,b) => test = `${a} ${b}`),
  ).subscribe({
    next([cmd,data]) {},
    error(er) { done(er) },
    complete() {
      expect(test).toBe('00 Too short');
      done();
    },
  });
});

test('Clean stream pipe: "Invalid checksum: D3"', done => {
  let test: String;
  of('6543D3\r\n').pipe(
    cleanStream((a,b) => test = `${a} ${b}`),
  ).subscribe({
    next([cmd,data]) {},
    error(er) { done(er) },
    complete() {
      expect(test).toBe('6543D3 Invalid checksum: D3');
      done();
    },
  });
});


