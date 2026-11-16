package de.crow08.portalsync.wscommunication.commands;

import de.crow08.portalsync.model.media.MinimalMedia;

import java.util.List;

public class SetMediaCommand extends Command {

  private final MinimalMedia currentMedia;
  private final QueueSnapshot snapshot;
  private final long syncRound;

  public SetMediaCommand(MinimalMedia currentMedia, QueueSnapshot snapshot, long syncRound) {
    super("SetMedia");
    this.currentMedia = currentMedia;
    this.snapshot = snapshot;
    this.syncRound = syncRound;
  }

  /** The sync round this command started: clients name it when they report ready. */
  public long getSyncRound() {
    return syncRound;
  }

  public MinimalMedia getCurrentMedia() {
    return currentMedia;
  }

  public List<MinimalMedia> getQueue() {
    return snapshot.queue();
  }

  public List<MinimalMedia> getHistory() {
    return snapshot.history();
  }

  /** Version of the queue and history, see {@link QueueSnapshot}. */
  public long getQueueVersion() {
    return snapshot.version();
  }
}
