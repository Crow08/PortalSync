package de.crow08.portalsync.wscommunication.commands;

/**
 * The session has been deleted: everyone in it is kicked.
 */
public class SessionDeletedCommand extends Command {

  public SessionDeletedCommand() {
    super("SessionDeleted");
  }
}
