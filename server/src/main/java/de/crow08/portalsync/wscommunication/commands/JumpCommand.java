package de.crow08.portalsync.wscommunication.commands;

public class JumpCommand extends Command {
  long startMediaTime;
  /** The sync round the jump started: clients name it when they report ready. */
  long syncRound;

  public JumpCommand() {
    super("Jump");
  }

  public JumpCommand(long startOffset, long syncRound) {
    super("Jump");
    this.startMediaTime = startOffset;
    this.syncRound = syncRound;
  }

  public long getSyncRound() {
    return syncRound;
  }

  public long getStartMediaTime() {
    return startMediaTime;
  }

  public void setStartMediaTime(long startMediaTime) {
    this.startMediaTime = startMediaTime;
  }
}
