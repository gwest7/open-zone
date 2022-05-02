import { EMPTY, of, switchMap, throwError } from 'rxjs';
import {
  cleanStream,
} from '../index';

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


