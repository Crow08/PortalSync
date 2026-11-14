package de.crow08.portalsync.model.queue;

import com.fasterxml.jackson.annotation.JsonIgnore;
import de.crow08.portalsync.model.media.Media;
import de.crow08.portalsync.model.playlists.Playlist;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Random;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The media of a session: the history (played), the current media and the queue (to be played). Clients show them as
 * one list in this order, so an "index in the combined list" counts the history first, then one slot for the current
 * media (also without a current media), then the queue.
 * <p>
 * Not thread safe: callers hold the lock of the session. Every change goes through a method of this class and counts
 * up the {@link #version()}, which clients use to drop outdated copies of the queue.
 */
public class Queue {

  private UUID id;

  private QueueEntry current;

  private final List<QueueEntry> queuedMedia;

  private final List<QueueEntry> historyMedia;

  private long version;

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

  public Media getCurrentMedia() {
    return current != null ? current.media() : null;
  }

  @JsonIgnore
  public QueueEntry getCurrent() {
    return current;
  }

  /** The media to be played, in order. Read only for callers: changes go through the methods of this class. */
  public List<QueueEntry> getQueuedMedia() {
    return queuedMedia;
  }

  /** The played media, the latest last. Read only for callers: changes go through the methods of this class. */
  public List<QueueEntry> getHistoryMedia() {
    return historyMedia;
  }

  /** Counts the changes of the queue, history and current media. A copy with a higher version is newer. */
  public long version() {
    return version;
  }

  /** Nothing queued, playing or played yet. */
  public boolean hasNoMedia() {
    return current == null && queuedMedia.isEmpty() && historyMedia.isEmpty();
  }

  /** Adds an entry at the end of the queue, or with {@code fair} in fair order (see {@link #addFair}). */
  public void add(QueueEntry entry, boolean fair) {
    if (fair) {
      addFair(entry);
    } else {
      queuedMedia.add(entry);
      version++;
    }
  }

  /** Adds an entry at the front of the queue: it is played next. */
  public void addNext(QueueEntry entry) {
    queuedMedia.add(0, entry);
    version++;
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
    version++;
  }

  /**
   * Makes the first queued media the current one, the previous current media goes to the history. At the end of the
   * queue there is no current media any more; with {@code loop} the history is played again instead.
   */
  public void next(boolean loop) {
    if (current != null) {
      historyMedia.add(current);
    }
    if (queuedMedia.isEmpty() && loop && !historyMedia.isEmpty()) {
      queuedMedia.addAll(historyMedia);
      historyMedia.clear();
    }
    current = queuedMedia.isEmpty() ? null : queuedMedia.remove(0);
    version++;
  }

  /**
   * Makes the latest media of the history the current one, the previous current media goes back to the front of the
   * queue. Without a history there is no current media any more; with {@code loop} the last queued media is taken.
   */
  public void previous(boolean loop) {
    if (current != null) {
      queuedMedia.add(0, current);
    }
    if (historyMedia.isEmpty() && loop && !queuedMedia.isEmpty()) {
      current = queuedMedia.remove(queuedMedia.size() - 1);
    } else if (!historyMedia.isEmpty()) {
      current = historyMedia.remove(historyMedia.size() - 1);
    } else {
      current = null;
    }
    version++;
  }

  /**
   * Makes the media at the given index the current one: the media before it end up in the history, the media after
   * it in the queue.
   *
   * @param index index in the combined list
   */
  public void skipTo(int index) {
    List<QueueEntry> all = new ArrayList<>(historyMedia);
    // the slot of the current media exists in the index even without a current media
    all.add(current);
    all.addAll(queuedMedia);
    Objects.checkIndex(index, all.size());
    historyMedia.clear();
    queuedMedia.clear();
    all.subList(0, index).stream().filter(Objects::nonNull).forEach(historyMedia::add);
    all.subList(index + 1, all.size()).stream().filter(Objects::nonNull).forEach(queuedMedia::add);
    current = all.get(index);
    version++;
  }

  /**
   * Moves a media of the history or queue to another place in the combined list. The current media can not be moved.
   * A target outside the list is the nearest end of it.
   *
   * @param from index of the media in the combined list
   * @param to   index in the combined list the media is dropped at: up to the slot of the current media it goes into
   *             the history (a media of the history: before that slot), behind it into the queue
   * @return false if there is no movable media at {@code from}
   */
  public boolean move(int from, int to) {
    int historySize = historyMedia.size();
    if (from < 0 || from == historySize || from > historySize + queuedMedia.size()) {
      return false;
    }
    boolean fromHistory = from < historySize;
    boolean toHistory = fromHistory ? to < historySize : to <= historySize;
    QueueEntry entry = fromHistory ? historyMedia.remove(from) : queuedMedia.remove(from - historySize - 1);
    if (toHistory) {
      historyMedia.add(clamp(to, historyMedia.size()), entry);
    } else {
      int queueIndex = fromHistory ? to - historySize : to - historySize - 1;
      queuedMedia.add(clamp(queueIndex, queuedMedia.size()), entry);
    }
    version++;
    return true;
  }

  private static int clamp(int index, int max) {
    return Math.max(0, Math.min(index, max));
  }

  /** Removes the media at the given index of the queue. */
  public void removeQueued(int queueIndex) {
    queuedMedia.remove(queueIndex);
    version++;
  }

  /** Removes the media at the given index of the history. */
  public void removeHistory(int historyIndex) {
    historyMedia.remove(historyIndex);
    version++;
  }

  /**
   * Shuffles the queue. With {@code fair} the result is in fair order: the media of each user are shuffled, but the
   * users still take turns (see {@link #addFair}).
   */
  public void shuffle(boolean fair) {
    shuffle(fair, new Random());
  }

  void shuffle(boolean fair, Random random) {
    Collections.shuffle(queuedMedia, random);
    if (fair) {
      List<QueueEntry> shuffled = new ArrayList<>(queuedMedia);
      queuedMedia.clear();
      shuffled.forEach(this::addFair);
    }
    version++;
  }

  /**
   * Finds a media of the queue. The index is the one a client saw, which may be outdated, and the same media can be
   * queued several times: the occurrence closest to the index is taken.
   *
   * @return the index in the queue, -1 if the media is not in it
   */
  public int findQueued(int expectedIndex, long mediaId) {
    return findNearest(queuedMedia, expectedIndex, mediaId);
  }

  /** Like {@link #findQueued} for the history. */
  public int findHistory(int expectedIndex, long mediaId) {
    return findNearest(historyMedia, expectedIndex, mediaId);
  }

  /**
   * Like {@link #findQueued} for the history and the queue together.
   *
   * @param expectedIndex index in the combined list
   * @return the index in the combined list, -1 if the media is neither in the history nor in the queue
   */
  public int findInHistoryAndQueue(int expectedIndex, long mediaId) {
    int historySize = historyMedia.size();
    int inHistory = findNearest(historyMedia, expectedIndex, mediaId);
    int inQueue = findNearest(queuedMedia, expectedIndex - historySize - 1, mediaId);
    int queueIndex = inQueue < 0 ? -1 : inQueue + historySize + 1;
    if (inHistory < 0 || queueIndex < 0) {
      return Math.max(inHistory, queueIndex);
    }
    return Math.abs(inHistory - expectedIndex) <= Math.abs(queueIndex - expectedIndex) ? inHistory : queueIndex;
  }

  private static int findNearest(List<QueueEntry> list, int expectedIndex, long mediaId) {
    int found = -1;
    for (int i = 0; i < list.size(); i++) {
      if (list.get(i).media().getId() == mediaId && (found < 0 || Math.abs(i - expectedIndex) < Math.abs(found - expectedIndex))) {
        found = i;
      }
    }
    return found;
  }
}
