package de.crow08.portalsync.wscommunication.commands;

import de.crow08.portalsync.model.media.MinimalMedia;

import java.util.List;

public class UpdateQueueAndHistoryCommand extends UpdateCommand {

  private final QueueSnapshot snapshot;

  public UpdateQueueAndHistoryCommand(QueueSnapshot snapshot) {
    super("QueueAndHistory");
    this.snapshot = snapshot;
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
