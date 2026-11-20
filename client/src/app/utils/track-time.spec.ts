import { describe, expect, it } from 'vitest';
import { formatTrackTime } from './track-time';

describe('formatTrackTime', () => {
  it('shows minutes and seconds below one hour', () => {
    expect(formatTrackTime(0)).toBe('00:00');
    expect(formatTrackTime(65.9)).toBe('01:05');
    expect(formatTrackTime(3599)).toBe('59:59');
  });

  it('shows the hours from one hour on', () => {
    expect(formatTrackTime(3600)).toBe('1:00:00');
    expect(formatTrackTime(2 * 3600 + 3 * 60 + 4)).toBe('2:03:04');
    expect(formatTrackTime(25 * 3600)).toBe('25:00:00');
  });

  it('is empty for what is no time', () => {
    expect(formatTrackTime(NaN)).toBe('');
    expect(formatTrackTime(Infinity)).toBe('');
  });
});
