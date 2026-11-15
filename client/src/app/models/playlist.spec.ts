import { Playlist } from './playlist';
import { User } from './user';

/** The client hides controls by these rules; the server enforces the same ones (PlaylistAccess). */
describe('Playlist', () => {
  const owner = new User(1, 'owner');
  const other = new User(2, 'other');
  const admin = new User(9, 'admin', true);

  function playlist(publicOwnership = false): Playlist {
    const result = new Playlist(4, 'mix');
    result.owners = [{ id: owner.id, username: owner.username }];
    result.publicOwnership = publicOwnership;
    return result;
  }

  it('is changed and managed by its owners', () => {
    expect(playlist().isOwnedBy(owner)).toBe(true);
    expect(playlist().canEdit(owner)).toBe(true);
    expect(playlist().canManage(owner)).toBe(true);
  });

  it('is read only for everyone else', () => {
    expect(playlist().isOwnedBy(other)).toBe(false);
    expect(playlist().canEdit(other)).toBe(false);
    expect(playlist().canManage(other)).toBe(false);
  });

  it('is changed by everybody when it is public, but still managed by its owners only', () => {
    expect(playlist(true).canEdit(other)).toBe(true);
    expect(playlist(true).canManage(other)).toBe(false);
  });

  it('is changed and managed by admins', () => {
    expect(playlist().canEdit(admin)).toBe(true);
    expect(playlist().canManage(admin)).toBe(true);
  });

  it('allows nothing without a user', () => {
    expect(playlist(true).canEdit(null)).toBe(false);
    expect(playlist(true).canManage(null)).toBe(false);
  });

  it('copes with a playlist the server sent without owners', () => {
    const result = playlist();
    (result as { owners: unknown }).owners = null;

    expect(result.isOwnedBy(owner)).toBe(false);
    expect(result.canEdit(owner)).toBe(false);
    expect(result.canManage(admin)).toBe(true);
  });
});
