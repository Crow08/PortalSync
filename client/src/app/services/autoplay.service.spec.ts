import { AutoplayService } from './autoplay.service';

describe('AutoplayService', () => {
  let service: AutoplayService;

  beforeEach(() => (service = new AutoplayService()));

  afterEach(() => {
    // remove the listeners of a service that is still waiting for an interaction
    document.dispatchEvent(new Event('pointerdown'));
    vi.unstubAllGlobals();
  });

  function browser(navigatorLike: object): void {
    vi.stubGlobal('navigator', navigatorLike);
  }

  it('assumes that playback is allowed until it knows better', () => {
    expect(service.blocked.value).toBe(false);
  });

  it('asks the browser for its autoplay policy where it can', () => {
    browser({ getAutoplayPolicy: () => 'allowed' });
    service.check();
    expect(service.blocked.value).toBe(false);

    browser({ getAutoplayPolicy: () => 'allowed-muted' });
    service.check();
    expect(service.blocked.value).toBe(true);
  });

  it('goes by the interaction with the page otherwise', () => {
    browser({ userActivation: { hasBeenActive: true } });
    service.check();
    expect(service.blocked.value).toBe(false);

    browser({ userActivation: { hasBeenActive: false } });
    service.check();
    expect(service.blocked.value).toBe(true);
  });

  it('takes a browser that tells nothing for blocked', () => {
    browser({});

    service.check();

    expect(service.blocked.value).toBe(true);
  });

  it('runs what was blocked with the first click, once', () => {
    const retry = vi.fn();
    const other = vi.fn();
    service.reportBlocked(retry);
    service.reportBlocked(other);
    expect(service.blocked.value).toBe(true);
    expect(retry).not.toHaveBeenCalled();

    document.dispatchEvent(new Event('pointerdown'));

    expect(service.blocked.value).toBe(false);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event('pointerdown'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('is unblocked by a key as well', () => {
    const retry = vi.fn();
    service.reportBlocked(retry);

    document.dispatchEvent(new Event('keydown'));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(service.blocked.value).toBe(false);
  });

  it('waits for the next interaction when playback is blocked again', () => {
    service.reportBlocked(vi.fn());
    document.dispatchEvent(new Event('pointerdown'));
    const retry = vi.fn();

    service.reportBlocked(retry);
    expect(service.blocked.value).toBe(true);
    document.dispatchEvent(new Event('pointerdown'));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
