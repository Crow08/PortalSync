/** The colors of the user avatars (header, lobby cards, people in the room); the text on them is var(--ps-bg). */
const AVATAR_COLORS = ['#86dbc2', '#ffbe5c', '#8fa8ff', '#f59bb0', '#c7e39b', '#e39a6b'];

/** The avatar color of a user: the same user has the same color everywhere. */
export function avatarColor(userId: number): string {
  return AVATAR_COLORS[Math.abs(userId) % AVATAR_COLORS.length];
}
