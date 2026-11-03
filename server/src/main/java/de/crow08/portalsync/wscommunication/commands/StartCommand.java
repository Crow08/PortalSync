package de.crow08.portalsync.wscommunication.commands;

public class StartCommand extends Command {
  long startServerTime;

  public StartCommand(long startServerTime) {
    super("Start");
    this.startServerTime = startServerTime;
  }

  public StartCommand() {
    super("Start");
  }

  public long getStartServerTime() {
    return startServerTime;
  }

  public void setStartServerTime(long startServerTime) {
    this.startServerTime = startServerTime;
  }
}
