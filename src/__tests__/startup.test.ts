import { ping } from '../index';
test('Invalid host halts ping', () => {
  expect(ping('')).toBe(null);
});