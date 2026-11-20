/** The speed is the average of the last seconds: long enough to be steady, short enough to follow a change. */
const SPEED_WINDOW = 3000;

/**
 * How far a transfer (an upload) is and how fast it goes. `update` takes what the browser reports, with the time as a
 * parameter; the speed is measured over the last few seconds, so it does not jump with every report.
 */
export class TransferProgress {
  /** Bytes sent so far. */
  loaded = 0;
  /** Bytes to send, 0 while unknown. */
  total = 0;
  /** Bytes per second, 0 until two reports lie far enough apart to measure it. */
  speed = 0;

  /** Earlier reports within the window, oldest first. */
  private samples: { time: number; loaded: number }[] = [];

  update(loaded: number, total: number, now: number): void {
    this.loaded = loaded;
    this.total = total;
    this.samples.push({ time: now, loaded });
    // keep one sample at or before the start of the window: the speed spans the whole window
    while (this.samples.length > 2 && this.samples[1].time <= now - SPEED_WINDOW) {
      this.samples.shift();
    }
    const oldest = this.samples[0];
    const elapsed = now - oldest.time;
    if (elapsed >= 250) {
      this.speed = Math.max(0, ((loaded - oldest.loaded) * 1000) / elapsed);
    }
  }

  /** From 0 to 1; 0 while the size is unknown. */
  get fraction(): number {
    return this.total > 0 ? Math.min(1, this.loaded / this.total) : 0;
  }

  get percent(): number {
    return Math.floor(this.fraction * 100);
  }

  /** Everything is sent: what remains is the work of the server. */
  get sent(): boolean {
    return this.total > 0 && this.loaded >= this.total;
  }

  /** Seconds until everything is sent at the current speed, undefined while that can not be told. */
  get remainingSeconds(): number | undefined {
    return this.total > 0 && this.speed > 0 ? Math.ceil((this.total - this.loaded) / this.speed) : undefined;
  }
}
