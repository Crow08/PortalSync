package de.crow08.portalsync.wscommunication.commands;

import de.crow08.portalsync.model.media.MinimalMedia;
import de.crow08.portalsync.model.queue.Queue;
import de.crow08.portalsync.model.queue.QueueEntry;

import java.util.List;

/**
 * A copy of the queue and history of a session as it is sent to the clients, with the version of the queue it was
 * taken from. Commands are handled concurrently and may reach the clients in another order than the changes happened:
 * a client keeps the copy with the highest version and drops older ones.
 * <p>
 * Take it while holding the lock of the session, together with the change it reports.
 */
public record QueueSnapshot(List<MinimalMedia> queue, List<MinimalMedia> history, long version) {

  public static QueueSnapshot of(Queue queue) {
    return new QueueSnapshot(minimal(queue.getQueuedMedia()), minimal(queue.getHistoryMedia()), queue.version());
  }

  private static List<MinimalMedia> minimal(List<QueueEntry> entries) {
    return entries.stream()
        .map(QueueEntry::media)
        .map(media -> new MinimalMedia(media.getId(), media.getTitle(), media.getType()))
        .toList();
  }
}
