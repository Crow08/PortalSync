import { GenericDataObject } from './genericDataObject';
import { User } from './user';

/** The owners of a playlist as the server sends them. */
export interface PlaylistOwner {
  id: number;
  username: string;
}

export class Playlist extends GenericDataObject {
  /** The user who created the playlist, null if it has no author. */
  author: PlaylistOwner | null = null;
  /** The users who may change the playlist and manage its owners; for everyone else it is read only. */
  owners: PlaylistOwner[] = [];
  /** Everyone may add songs to the playlist and remove songs from it. Only the owners manage the owners and this flag. */
  publicOwnership = false;

  constructor(id: number, name: string) {
    super(id, name);
  }

  isOwnedBy(user: User): boolean {
    return (this.owners ?? []).some((owner) => owner.id === user.id);
  }

  /** Whether the user may add songs to the playlist and remove songs from it: owners, admins, and all if it is public. */
  canEdit(user: User | null): boolean {
    return !!user && (this.publicOwnership || this.canManage(user));
  }

  /** Whether the user may change the owners and the public flag: the owners and admins. */
  canManage(user: User | null): boolean {
    return !!user && (user.admin || this.isOwnedBy(user));
  }
}
