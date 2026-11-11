package de.crow08.portalsync.model.queue;

import com.fasterxml.jackson.annotation.JsonIgnore;
import de.crow08.portalsync.model.media.Media;
import de.crow08.portalsync.model.playlists.Playlist;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

public class Queue {

  private UUID id;

  private QueueEntry current;

  private List<QueueEntry> queuedMedia;

  private List<QueueEntry> historyMedia;

  public Queue() {
    queuedMedia = new ArrayList<>();
    historyMedia = new ArrayList<>();
  }

  public Queue(Playlist playlist) {
    queuedMedia = playlist.getSongs().stream().map(media -> new QueueEntry(media, null)).collect(Collectors.toList());
    historyMedia = new ArrayList<>();
  }

  public UUID getId() {
    return id;
  }

  public void setId(UUID id) {
    this.id = id;
  }

  public Media getCurrentMedia() {
    return current != null ? current.media() : null;
  }

  @JsonIgnore
  public QueueEntry getCurrent() {
    return current;
  }

  public void setCurrent(QueueEntry current) {
    this.current = current;
  }

  public List<QueueEntry> getQueuedMedia() {
    return queuedMedia;
  }

  public void setQueuedSongs(List<QueueEntry> queuedMedia) {
    this.queuedMedia = queuedMedia;
  }

  public List<QueueEntry> getHistoryMedia() {
    return historyMedia;
  }

  public void setHistorySongs(List<QueueEntry> historyMedia) {
    this.historyMedia = historyMedia;
  }

  /**
   * Adds an entry in fair order instead of at the end: the users take turns. The n-th queued media of a user is placed
   * behind the n-th media of everyone else, so a user who adds many media at once does not push back the others.
   * The user whose media is playing right now already had a turn: the media of the other users go before that user's
   * next one.
   * <p>
   * Only the position of the new entry is chosen, the existing queue is not reordered. If it is not in fair order
   * (moved by hand, filled before the mode was switched on) the entry goes behind the last media that is
   * due before it.
   */
  public void addFair(QueueEntry entry) {
    boolean ownerIsPlaying = current != null && Objects.equals(current.addedBy(), entry.addedBy());
    int turn = 1 + (int) queuedMedia.stream().filter(queued -> Objects.equals(queued.addedBy(), entry.addedBy())).count();
    Map<Long, Integer> turns = new HashMap<>();
    int index = 0;
    for (int i = 0; i < queuedMedia.size(); i++) {
      Long owner = queuedMedia.get(i).addedBy();
      int queuedTurn = turns.merge(owner, 1, Integer::sum);
      if (current != null && !ownerIsPlaying && Objects.equals(owner, current.addedBy())) {
        queuedTurn++;
      }
      if (queuedTurn <= turn) {
        index = i + 1;
      }
    }
    queuedMedia.add(index, entry);
  }
}
