package de.crow08.portalsync.wscommunication.commands;

public abstract class Command {
  String type;

  public Command(String type) {
    this.type = type;
  }

  public String getType() {
    return type;
  }

  public void setType(String type) {
    this.type = type;
  }
}
