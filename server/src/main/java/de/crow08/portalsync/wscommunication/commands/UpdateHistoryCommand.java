package de.crow08.portalsync.wscommunication.commands;

import de.crow08.portalsync.model.media.MinimalMedia;

import java.util.List;

public class UpdateHistoryCommand extends UpdateCommand {

  private final QueueSnapshot snapshot;

  public UpdateHistoryCommand(QueueSnapshot snapshot) {
    super("History");
    this.snapshot = snapshot;
  }

  public List<MinimalMedia> getHistory() {
    return snapshot.history();
  }

  /** Version of the history, see {@link QueueSnapshot}. */
  public long getQueueVersion() {
    return snapshot.version();
  }
}
