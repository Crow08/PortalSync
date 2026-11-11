package de.crow08.portalsync.wscommunication.commands;

public class UpdateFairQueueCommand extends UpdateCommand {
  boolean fairQueue;

  public UpdateFairQueueCommand() {
    super("FairQueue");
  }

  public UpdateFairQueueCommand(boolean fairQueue) {
    super("FairQueue");
    this.fairQueue = fairQueue;
  }

  public boolean isFairQueue() {
    return fairQueue;
  }

  public void setFairQueue(boolean fairQueue) {
    this.fairQueue = fairQueue;
  }
}
