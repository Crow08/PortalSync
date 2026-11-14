package de.crow08.portalsync.wscommunication.commands;

import de.crow08.portalsync.model.media.MinimalMedia;

import java.util.List;

public class StopCommand extends Command {

  /** Only set when the queue ended: the last media moved into the history, there is no current media. */
  private final QueueSnapshot snapshot;

  public StopCommand() {
    this(null);
  }

  public StopCommand(QueueSnapshot snapshot) {
    super("Stop");
    this.snapshot = snapshot;
  }

  public List<MinimalMedia> getQueue() {
    return snapshot != null ? snapshot.queue() : null;
  }

  public List<MinimalMedia> getHistory() {
    return snapshot != null ? snapshot.history() : null;
  }

  /** Version of the queue and history, see {@link QueueSnapshot}; null without them. */
  public Long getQueueVersion() {
    return snapshot != null ? snapshot.version() : null;
  }
}
