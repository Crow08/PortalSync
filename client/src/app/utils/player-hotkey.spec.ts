import { afterEach, describe, expect, it } from 'vitest';
import { playerHotkey } from './player-hotkey';

/** The hotkey of a key pressed while an element built from the HTML has the focus (the body without HTML). */
function press(init: KeyboardEventInit, html?: string): ReturnType<typeof playerHotkey> {
  let target: Element = document.body;
  if (html) {
    document.body.innerHTML = html;
    target = document.body.querySelector('[data-target]') ?? document.body.firstElementChild!;
  }
  let result: ReturnType<typeof playerHotkey> = null;
  const listener = (event: KeyboardEvent) => (result = playerHotkey(event));
  document.addEventListener('keydown', listener);
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  document.removeEventListener('keydown', listener);
  return result;
}

describe('playerHotkey', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('takes space for the playback and M for the mute', () => {
    expect(press({ key: ' ' })).toBe('playback');
    expect(press({ key: 'm' })).toBe('mute');
    expect(press({ key: 'M', shiftKey: true })).toBe('mute');
  });

  it('ignores other keys, modifiers and a held key', () => {
    expect(press({ key: 'k' })).toBeNull();
    expect(press({ key: 'Enter' })).toBeNull();
    expect(press({ key: 'm', ctrlKey: true })).toBeNull();
    expect(press({ key: 'm', altKey: true })).toBeNull();
    expect(press({ key: ' ', metaKey: true })).toBeNull();
    expect(press({ key: ' ', repeat: true })).toBeNull();
  });

  it('ignores the keys while the user types', () => {
    expect(press({ key: 'm' }, '<input type="text">')).toBeNull();
    expect(press({ key: ' ' }, '<input>')).toBeNull();
    expect(press({ key: 'm' }, '<textarea></textarea>')).toBeNull();
    expect(press({ key: 'm' }, '<div contenteditable="true"><span data-target></span></div>')).toBeNull();
  });

  it('works on a slider, which takes no text', () => {
    expect(press({ key: ' ' }, '<input type="range">')).toBe('playback');
    expect(press({ key: 'm' }, '<input type="range">')).toBe('mute');
  });

  it('leaves space to the control that has the focus, M still mutes there', () => {
    expect(press({ key: ' ' }, '<button><span data-target></span></button>')).toBeNull();
    expect(press({ key: ' ' }, '<a href="/library"></a>')).toBeNull();
    expect(press({ key: ' ' }, '<div role="radio"></div>')).toBeNull();
    expect(press({ key: 'm' }, '<button></button>')).toBe('mute');
  });

  it('ignores the keys in a menu or dialog', () => {
    expect(press({ key: 'm' }, '<div class="cdk-overlay-container"><div data-target></div></div>')).toBeNull();
  });

  it('ignores a key that something else already handled', () => {
    const event = new KeyboardEvent('keydown', { key: ' ', cancelable: true });
    event.preventDefault();
    expect(playerHotkey(event)).toBeNull();
  });
});
