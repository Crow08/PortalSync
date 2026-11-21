export type PlayerHotkey = 'playback' | 'mute';

/** Elements the user types into: no hotkey while one of them has the focus. A slider takes no text. */
const TYPING = 'input:not([type=range]), textarea, select, [contenteditable]:not([contenteditable=false])';
/** Elements the space key activates itself: there it keeps doing that. */
const SPACE_ACTIVATED = [
  'button, a[href], summary',
  '[role=button], [role=switch], [role=radio], [role=checkbox], [role=menuitem], [role=option], [role=tab]',
].join(', ');
/** Menus, dialogs and dropdowns of Material have their own keys (e.g. typing a letter selects a menu item). */
const OVERLAY = '.cdk-overlay-container';

/**
 * The hotkey of the player a key press stands for: space toggles the playback, M the mute. Null for every other key,
 * with a modifier, for a held key and while the focus is where the key has another meaning.
 */
export function playerHotkey(event: KeyboardEvent): PlayerHotkey | null {
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.altKey || event.metaKey) {
    return null;
  }
  const hotkey: PlayerHotkey | null = event.key === ' ' ? 'playback' : event.key.toLowerCase() === 'm' ? 'mute' : null;
  if (!hotkey) {
    return null;
  }
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest(`${TYPING}, ${OVERLAY}`) || (hotkey === 'playback' && target?.closest(SPACE_ACTIVATED))) {
    return null;
  }
  return hotkey;
}
