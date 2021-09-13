
import { getBitStates, getChecksum } from '../utils';

test('Calculate checksum', () => {
  expect(getChecksum('6543')).toBe('D2');
  expect(getChecksum('000')).toBe('90');
  expect(getChecksum('6200000')).toBe('58');
})

test('Extract bits', () => {
  expect(getBitStates('FF').map(b => b?'1':'0').join('')).toBe('11111111');
  expect(getBitStates('00').map(b => b?'1':'0').join('')).toBe('00000000');
  expect(getBitStates('5A').map(b => b?'1':'0').join('')).toBe('01011010');
})