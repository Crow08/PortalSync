import { describe, expect, it } from 'vitest';
import { TransferProgress } from './transfer-progress';

describe('TransferProgress', () => {
  it('knows nothing before the first report', () => {
    const progress = new TransferProgress();

    expect(progress.fraction).toBe(0);
    expect(progress.speed).toBe(0);
    expect(progress.sent).toBe(false);
    expect(progress.remainingSeconds).toBeUndefined();
  });

  it('reports how far the transfer is', () => {
    const progress = new TransferProgress();
    progress.update(250, 1000, 0);

    expect(progress.fraction).toBe(0.25);
    expect(progress.percent).toBe(25);
    // one report is no speed yet
    expect(progress.speed).toBe(0);
    expect(progress.remainingSeconds).toBeUndefined();
  });

  it('measures the speed and the time that is left', () => {
    const progress = new TransferProgress();
    progress.update(0, 10_000, 0);
    progress.update(1000, 10_000, 1000);

    expect(progress.speed).toBe(1000);
    expect(progress.remainingSeconds).toBe(9);
  });

  it('does not take a speed from reports that follow each other at once', () => {
    const progress = new TransferProgress();
    progress.update(0, 10_000, 0);
    progress.update(5000, 10_000, 10);

    expect(progress.speed).toBe(0);
  });

  it('follows a change of the speed within a few seconds', () => {
    const progress = new TransferProgress();
    // 1000 bytes per second for 10 s, then 100 per second
    for (let second = 0; second <= 10; second++) {
      progress.update(second * 1000, 100_000, second * 1000);
    }
    expect(progress.speed).toBe(1000);
    for (let second = 11; second <= 14; second++) {
      progress.update(10_000 + (second - 10) * 100, 100_000, second * 1000);
    }

    expect(progress.speed).toBe(100);
  });

  it('is sent when all bytes are, and 99 % until then', () => {
    const progress = new TransferProgress();
    progress.update(999, 1000, 0);
    expect(progress.percent).toBe(99);
    expect(progress.sent).toBe(false);

    progress.update(1000, 1000, 1000);
    expect(progress.percent).toBe(100);
    expect(progress.sent).toBe(true);
    expect(progress.remainingSeconds).toBe(0);
  });

  it('has no fraction while the size is unknown', () => {
    const progress = new TransferProgress();
    progress.update(500, 0, 0);
    progress.update(1500, 0, 1000);

    expect(progress.fraction).toBe(0);
    expect(progress.speed).toBe(1000);
    expect(progress.sent).toBe(false);
    expect(progress.remainingSeconds).toBeUndefined();
  });
});
