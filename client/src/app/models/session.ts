import { GenericDataObject } from './genericDataObject';
import { Media } from './media';
import { User } from './user';

export type SessionPlayState = 'PLAY' | 'STOP' | 'PAUSE' | 'SYNC_PLAY' | 'SYNC_STOP' | 'SYNC_PAUSE';

export class Session extends GenericDataObject {
  /** Id of the user who created the session. */
  creatorId = 0;
  /** The users currently in the session. */
  users: User[] = [];
  sessionState: SessionPlayState = 'STOP';
  queue?: { currentMedia?: Media | null };
}
