package de.crow08.portalsync.wscommunication.commands;

import de.crow08.portalsync.model.media.MinimalMedia;

import java.util.List;

public class UpdateQueueCommand extends UpdateCommand {

  private final QueueSnapshot snapshot;

  public UpdateQueueCommand(QueueSnapshot snapshot) {
    super("Queue");
    this.snapshot = snapshot;
  }

  public List<MinimalMedia> getQueue() {
    return snapshot.queue();
  }

  /** Version of the queue, see {@link QueueSnapshot}. */
  public long getQueueVersion() {
    return snapshot.version();
  }
}
