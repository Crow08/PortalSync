package de.crow08.portalsync.model.queue;

import de.crow08.portalsync.model.media.Media;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Random;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class QueueTest {

  private static final Long ANNA = 1L;
  private static final Long BEN = 2L;

  private static QueueEntry entry(long mediaId, Long addedBy) {
    return new QueueEntry(new Media(mediaId), addedBy);
  }

  private static List<Long> ids(List<QueueEntry> entries) {
    return entries.stream().map(queued -> queued.media().getId()).toList();
  }

  private static List<Long> owners(List<QueueEntry> entries) {
    return entries.stream().map(QueueEntry::addedBy).toList();
  }

  private static Long currentId(Queue queue) {
    return queue.getCurrentMedia() != null ? queue.getCurrentMedia().getId() : null;
  }

  /** History 1, 2; current media 3; queue 4, 5, 6: the combined list is 1 to 6 with the indices 0 to 5. */
  private static Queue sixMedia() {
    Queue queue = new Queue();
    for (long id = 1; id <= 6; id++) {
      queue.add(entry(id, null), false);
    }
    queue.next(false);
    queue.next(false);
    queue.next(false);
    return queue;
  }

  @Test
  void nextWalksThroughTheQueueAndEndsWithoutCurrentMedia() {
    Queue queue = new Queue();
    queue.add(entry(1, null), false);
    queue.add(entry(2, null), false);
    assertThat(queue.hasNoMedia()).isFalse();

    queue.next(false);
    assertThat(currentId(queue)).isEqualTo(1);
    queue.next(false);
    assertThat(currentId(queue)).isEqualTo(2);
    assertThat(ids(queue.getHistoryMedia())).containsExactly(1L);

    queue.next(false);
    assertThat(queue.getCurrentMedia()).isNull();
    assertThat(ids(queue.getHistoryMedia())).containsExactly(1L, 2L);
    assertThat(queue.getQueuedMedia()).isEmpty();
  }

  @Test
  void nextWithLoopPlaysTheHistoryAgain() {
    Queue queue = new Queue();
    queue.add(entry(1, null), false);
    queue.add(entry(2, null), false);
    queue.next(true);
    queue.next(true);

    queue.next(true);

    assertThat(currentId(queue)).isEqualTo(1);
    assertThat(ids(queue.getQueuedMedia())).containsExactly(2L);
    assertThat(queue.getHistoryMedia()).isEmpty();
  }

  @Test
  void nextWithLoopRepeatsASingleMedia() {
    Queue queue = new Queue();
    queue.add(entry(1, null), false);
    queue.next(true);

    queue.next(true);

    assertThat(currentId(queue)).isEqualTo(1);
    assertThat(queue.getHistoryMedia()).isEmpty();
  }

  @Test
  void previousTakesTheLatestOfTheHistory() {
    Queue queue = sixMedia();

    queue.previous(false);

    assertThat(currentId(queue)).isEqualTo(2);
    assertThat(ids(queue.getHistoryMedia())).containsExactly(1L);
    assertThat(ids(queue.getQueuedMedia())).containsExactly(3L, 4L, 5L, 6L);
  }

  @Test
  void previousWithoutHistoryEndsWithoutCurrentMediaOrLoopsToTheEndOfTheQueue() {
    Queue plain = new Queue();
    plain.add(entry(1, null), false);
    plain.add(entry(2, null), false);
    plain.next(false);
    plain.previous(false);
    assertThat(plain.getCurrentMedia()).isNull();
    assertThat(ids(plain.getQueuedMedia())).containsExactly(1L, 2L);

    Queue loop = new Queue();
    loop.add(entry(1, null), false);
    loop.add(entry(2, null), false);
    loop.next(true);
    loop.previous(true);
    assertThat(currentId(loop)).isEqualTo(2);
    assertThat(ids(loop.getQueuedMedia())).containsExactly(1L);
  }

  @Test
  void skipToSplitsTheCombinedListAroundTheNewCurrentMedia() {
    Queue queue = sixMedia();

    queue.skipTo(4);

    assertThat(ids(queue.getHistoryMedia())).containsExactly(1L, 2L, 3L, 4L);
    assertThat(currentId(queue)).isEqualTo(5);
    assertThat(ids(queue.getQueuedMedia())).containsExactly(6L);

    queue.skipTo(0);
    assertThat(queue.getHistoryMedia()).isEmpty();
    assertThat(currentId(queue)).isEqualTo(1);
    assertThat(ids(queue.getQueuedMedia())).containsExactly(2L, 3L, 4L, 5L, 6L);
  }

  @Test
  void skipToCountsTheSlotOfAMissingCurrentMedia() {
    Queue queue = new Queue();
    queue.add(entry(1, null), false);
    queue.add(entry(2, null), false);

    // no history, the empty slot of the current media is index 0
    queue.skipTo(2);

    assertThat(ids(queue.getHistoryMedia())).containsExactly(1L);
    assertThat(currentId(queue)).isEqualTo(2);
    assertThatThrownBy(() -> queue.skipTo(7)).isInstanceOf(IndexOutOfBoundsException.class);
  }

  @Test
  void moveWithinTheHistory() {
    Queue queue = sixMedia();
    assertThat(queue.move(0, 1)).isTrue();
    assertThat(ids(queue.getHistoryMedia())).containsExactly(2L, 1L);
    assertThat(ids(queue.getQueuedMedia())).containsExactly(4L, 5L, 6L);
  }

  @Test
  void moveFromTheHistoryIntoTheQueue() {
    Queue queue = sixMedia();
    // 1 2 [3] 4 5 6 -> 2 [3] 4 5 1 6
    assertThat(queue.move(0, 4)).isTrue();
    assertThat(ids(queue.getHistoryMedia())).containsExactly(2L);
    assertThat(ids(queue.getQueuedMedia())).containsExactly(4L, 5L, 1L, 6L);
  }

  @Test
  void moveFromTheQueueIntoTheHistory() {
    Queue queue = sixMedia();
    // 1 2 [3] 4 5 6 -> 1 5 2 [3] 4 6
    assertThat(queue.move(4, 1)).isTrue();
    assertThat(ids(queue.getHistoryMedia())).containsExactly(1L, 5L, 2L);
    assertThat(ids(queue.getQueuedMedia())).containsExactly(4L, 6L);
  }

  @Test
  void moveFromTheQueueOntoTheSlotOfTheCurrentMediaGoesToTheEndOfTheHistory() {
    Queue queue = sixMedia();
    assertThat(queue.move(3, 2)).isTrue();
    assertThat(ids(queue.getHistoryMedia())).containsExactly(1L, 2L, 4L);
    assertThat(ids(queue.getQueuedMedia())).containsExactly(5L, 6L);
  }

  @Test
  void moveWithinTheQueue() {
    Queue queue = sixMedia();
    assertThat(queue.move(5, 3)).isTrue();
    assertThat(ids(queue.getQueuedMedia())).containsExactly(6L, 4L, 5L);
    assertThat(ids(queue.getHistoryMedia())).containsExactly(1L, 2L);
  }

  @Test
  void moveKeepsTheMediaWhenTheTargetIsOutsideTheList() {
    Queue queue = sixMedia();
    assertThat(queue.move(3, 99)).isTrue();
    assertThat(ids(queue.getQueuedMedia())).containsExactly(5L, 6L, 4L);

    assertThat(queue.move(1, -5)).isTrue();
    assertThat(ids(queue.getHistoryMedia())).containsExactly(2L, 1L);
  }

  @Test
  void theCurrentMediaAndUnknownIndicesCanNotBeMoved() {
    Queue queue = sixMedia();
    long version = queue.version();

    assertThat(queue.move(2, 0)).isFalse();
    assertThat(queue.move(6, 0)).isFalse();
    assertThat(queue.move(-1, 0)).isFalse();

    assertThat(currentId(queue)).isEqualTo(3);
    assertThat(ids(queue.getHistoryMedia())).containsExactly(1L, 2L);
    assertThat(ids(queue.getQueuedMedia())).containsExactly(4L, 5L, 6L);
    assertThat(queue.version()).isEqualTo(version);
  }

  @Test
  void findTakesTheOccurrenceNearestToTheIndexTheClientSaw() {
    Queue queue = new Queue();
    for (long id : new long[]{7, 8, 7, 9, 7}) {
      queue.add(entry(id, null), false);
    }

    assertThat(queue.findQueued(0, 7)).isEqualTo(0);
    assertThat(queue.findQueued(3, 7)).isEqualTo(2);
    assertThat(queue.findQueued(4, 7)).isEqualTo(4);
    // the queue changed since the client looked: the media is found at its new place
    assertThat(queue.findQueued(0, 9)).isEqualTo(3);
    assertThat(queue.findQueued(0, 42)).isEqualTo(-1);
  }

  @Test
  void findInHistoryAndQueueAnswersWithTheIndexInTheCombinedList() {
    Queue queue = new Queue();
    for (long id : new long[]{7, 8, 5, 7, 9}) {
      queue.add(entry(id, null), false);
    }
    queue.next(false);
    queue.next(false);
    queue.next(false);
    // history 7 8, current 5, queue 7 9

    assertThat(queue.findHistory(1, 7)).isEqualTo(0);
    assertThat(queue.findInHistoryAndQueue(0, 7)).isEqualTo(0);
    assertThat(queue.findInHistoryAndQueue(3, 7)).isEqualTo(3);
    assertThat(queue.findInHistoryAndQueue(0, 9)).isEqualTo(4);
    assertThat(queue.findInHistoryAndQueue(4, 8)).isEqualTo(1);
    // the current media is neither in the history nor in the queue
    assertThat(queue.findInHistoryAndQueue(2, 5)).isEqualTo(-1);
  }

  @Test
  void fairOrderLetsTheUsersTakeTurns() {
    Queue queue = new Queue();
    queue.add(entry(1, ANNA), true);
    queue.add(entry(2, ANNA), true);
    queue.add(entry(3, ANNA), true);

    queue.add(entry(4, BEN), true);
    assertThat(ids(queue.getQueuedMedia())).containsExactly(1L, 4L, 2L, 3L);

    queue.add(entry(5, BEN), true);
    assertThat(ids(queue.getQueuedMedia())).containsExactly(1L, 4L, 2L, 5L, 3L);
  }

  @Test
  void fairOrderCountsThePlayingMediaAsATurn() {
    Queue queue = new Queue();
    queue.add(entry(1, ANNA), true);
    queue.add(entry(2, ANNA), true);
    queue.next(false);

    // Anna is playing: Ben is due before her next media
    queue.add(entry(3, BEN), true);

    assertThat(ids(queue.getQueuedMedia())).containsExactly(3L, 2L);
  }

  @Test
  void plainOrderAddsAtTheEndAndAddNextAtTheFront() {
    Queue queue = new Queue();
    queue.add(entry(1, ANNA), false);
    queue.add(entry(2, ANNA), false);
    queue.add(entry(3, BEN), false);
    queue.addNext(entry(4, BEN));

    assertThat(ids(queue.getQueuedMedia())).containsExactly(4L, 1L, 2L, 3L);
  }

  @Test
  void fairShuffleKeepsTheTurnsAndAllMedia() {
    Queue queue = new Queue();
    for (long id = 1; id <= 4; id++) {
      queue.add(entry(id, ANNA), false);
    }
    for (long id = 5; id <= 8; id++) {
      queue.add(entry(id, BEN), false);
    }

    queue.shuffle(true, new Random(7));

    List<Long> owners = owners(queue.getQueuedMedia());
    for (int i = 0; i + 1 < owners.size(); i += 2) {
      assertThat(owners.subList(i, i + 2)).containsExactlyInAnyOrder(ANNA, BEN);
    }
    assertThat(ids(queue.getQueuedMedia())).containsExactlyInAnyOrder(1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L);
  }

  @Test
  void everyChangeCountsUpTheVersion() {
    Queue queue = new Queue();
    long version = queue.version();

    queue.add(entry(1, null), false);
    assertThat(queue.version()).isGreaterThan(version);
    version = queue.version();

    queue.add(entry(2, ANNA), true);
    queue.addNext(entry(3, null));
    queue.add(entry(4, null), false);
    assertThat(queue.version()).isGreaterThan(version);
    version = queue.version();

    queue.next(false);
    assertThat(queue.version()).isGreaterThan(version);
    version = queue.version();

    queue.move(1, 2);
    assertThat(queue.version()).isGreaterThan(version);
    version = queue.version();

    queue.removeQueued(0);
    assertThat(queue.version()).isGreaterThan(version);
    version = queue.version();

    queue.shuffle(false);
    assertThat(queue.version()).isGreaterThan(version);
    version = queue.version();

    queue.skipTo(0);
    assertThat(queue.version()).isGreaterThan(version);
    version = queue.version();

    queue.previous(false);
    assertThat(queue.version()).isGreaterThan(version);
  }
}
