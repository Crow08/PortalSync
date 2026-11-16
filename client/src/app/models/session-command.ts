import { MinimalMedia } from './minimalMedia';
import { User } from './user';
import { UserStatus } from './userStatus';

/**
 * The commands the server broadcasts on the topic of a session, as they arrive as JSON. They mirror the classes in
 * `server/.../wscommunication/commands`; the server test `CommandJsonTest` pins their fields, so a change there fails
 * a test that points here. A new command needs: its type here, the class and handler on the server, and a case in
 * `PlayerEngineService.processCommand` (the compiler reports a missing case).
 */

/**
 * Sync rounds: SetMedia and Jump make every client load something, and the server waits for all of them before it
 * starts the playback (sessionState SYNC_*). Each of these commands starts a round and names it (syncRound); a client
 * answers `ready/{user}/{media}/{position}/{round}` with that id once it has loaded. A report for an earlier round does
 * not count, so the server never starts a round for a client that has not seen the command for it yet, and a Start
 * can not arrive before the SetMedia it belongs to.
 */

/** The state of the playback of a session on the server; SYNC_*: it waits for the users to load the media. */
export type SessionState = 'PLAY' | 'STOP' | 'PAUSE' | 'SYNC_PLAY' | 'SYNC_STOP' | 'SYNC_PAUSE';

/**
 * A copy of the queue and/or history with the version of the queue it was taken from. Commands can overtake each
 * other: a copy older than the one shown is dropped (see `PlayerEngineService.applyQueue`).
 */
export interface QueueCopy {
  queue?: MinimalMedia[] | null;
  history?: MinimalMedia[] | null;
  queueVersion?: number | null;
}

/** The playback starts (after a sync round) or resumes at the given server time (epoch ms). */
export interface StartCommand {
  type: 'Start' | 'Resume';
  startServerTime: number;
}

/** A new current media: every client loads it and reports ready. */
export interface SetMediaCommand extends QueueCopy {
  type: 'SetMedia';
  currentMedia: MinimalMedia;
  queue: MinimalMedia[];
  history: MinimalMedia[];
  queueVersion: number;
  /** The sync round this command started; the client names it when it reports ready (see SyncRound below). */
  syncRound: number;
}

export interface PauseCommand {
  type: 'Pause';
  /** Position in ms the playback is paused at. */
  mediaStopTime: number;
}

/** The playback stopped. At the end of the queue it carries the queue and history: there is no current media then. */
export interface StopCommand extends QueueCopy {
  type: 'Stop';
}

/** The position changed: every client seeks to it and reports ready. */
export interface JumpCommand {
  type: 'Jump';
  /** New position in ms. */
  startMediaTime: number;
  /** The sync round this command started; the client names it when it reports ready. */
  syncRound: number;
}

export interface LeaveCommand {
  type: 'Leave';
  userId: number;
}

export interface SessionDeletedCommand {
  type: 'SessionDeleted';
}

/** The answer to a command that changed nothing. */
export interface NopCommand {
  type: 'Nop';
}

/** A user joined. For that user it is the whole state of the session, the others only take the users from it. */
export interface JoinCommand extends QueueCopy {
  type: 'Join';
  userId: number;
  currentMedia: MinimalMedia | null;
  queue: MinimalMedia[];
  history: MinimalMedia[];
  queueVersion: number;
  /** The sync round that is running (sessionState SYNC_*), 0 if none; the joining client reports ready for it. */
  syncRound: number;
  sessionUsers: User[];
  userStatuses: UserStatus[];
  sessionState: SessionState;
  loopMode: boolean;
  fairQueue: boolean;
  /** Server time (epoch ms) at which a running playback is at startMediaTime. */
  startServerTime: number;
  /** Position in ms: of the running playback at startServerTime, else where it is paused. */
  startMediaTime: number;
}

export type UpdateCommand =
  | { type: 'Update'; updateType: 'LoopMode'; loopMode: boolean }
  | { type: 'Update'; updateType: 'FairQueue'; fairQueue: boolean }
  | ({ type: 'Update'; updateType: 'Queue'; queue: MinimalMedia[]; queueVersion: number } & QueueCopy)
  | ({ type: 'Update'; updateType: 'History'; history: MinimalMedia[]; queueVersion: number } & QueueCopy)
  | ({
      type: 'Update';
      updateType: 'QueueAndHistory';
      queue: MinimalMedia[];
      history: MinimalMedia[];
      queueVersion: number;
    } & QueueCopy)
  | { type: 'Update'; updateType: 'UserStatus'; userStatus: UserStatus };

export type SessionCommand =
  | StartCommand
  | SetMediaCommand
  | PauseCommand
  | StopCommand
  | JumpCommand
  | LeaveCommand
  | SessionDeletedCommand
  | NopCommand
  | JoinCommand
  | UpdateCommand;

const COMMAND_TYPES: ReadonlySet<string> = new Set<SessionCommand['type']>([
  'Start',
  'Resume',
  'SetMedia',
  'Pause',
  'Stop',
  'Jump',
  'Leave',
  'SessionDeleted',
  'Nop',
  'Join',
  'Update',
]);

const UPDATE_TYPES: ReadonlySet<string> = new Set<UpdateCommand['updateType']>([
  'LoopMode',
  'FairQueue',
  'Queue',
  'History',
  'QueueAndHistory',
  'UserStatus',
]);

/**
 * Reads a message of the session topic.
 *
 * @return the command, null for a message this client does not know (e.g. a command of a newer server): it is
 * ignored instead of being taken for another command.
 */
export function parseSessionCommand(json: string): SessionCommand | null {
  let message: unknown;
  try {
    message = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof message !== 'object' || message === null) {
    return null;
  }
  const { type, updateType } = message as { type?: unknown; updateType?: unknown };
  if (typeof type !== 'string' || !COMMAND_TYPES.has(type)) {
    return null;
  }
  if (type === 'Update' && (typeof updateType !== 'string' || !UPDATE_TYPES.has(updateType))) {
    return null;
  }
  return message as SessionCommand;
}
