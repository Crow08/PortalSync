/**
 * A position or length of a media for the seek bar: "mm:ss", from one hour on "h:mm:ss". Empty for what is no time
 * (the length of a media that is not loaded yet).
 */
export function formatTrackTime(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return '';
  }
  const total = Math.max(0, Math.floor(seconds));
  const two = (value: number) => String(value).padStart(2, '0');
  const hours = Math.floor(total / 3600);
  const rest = `${two(Math.floor((total % 3600) / 60))}:${two(total % 60)}`;
  return hours > 0 ? `${hours}:${rest}` : rest;
}
