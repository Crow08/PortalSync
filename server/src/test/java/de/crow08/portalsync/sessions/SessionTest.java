package de.crow08.portalsync.sessions;

import de.crow08.portalsync.model.media.Media;
import de.crow08.portalsync.model.users.User;
import de.crow08.portalsync.sessions.Session.SessionState;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SessionTest {

  private static final Instant T0 = Instant.parse("2026-01-01T12:00:00Z");
  private static final long LEAD = 500;
  private static final long MEDIA = 11;
  private static final long NEXT_MEDIA = 12;

  private static Instant at(long millis) {
    return T0.plusMillis(millis);
  }

  /** A session with one user whose first media is the current one; stopped, as after creating a lobby. */
  private static Session sessionWithMedia() {
    Session session = new Session("test");
    session.getUsers().add(new User(1, "anna", false));
    session.addMedia(List.of(new Media(MEDIA), new Media(NEXT_MEDIA)), 1L);
    session.nextMedia();
    return session;
  }

  /** Like pressing play in a stopped lobby and all users being ready at {@code readyAt}. */
  private static Session playing(long readyAt) {
    Session session = sessionWithMedia();
    session.startPlayback();
    session.enterSync();
    session.finishSync(at(readyAt), LEAD);
    return session;
  }

  @Test
  void aNewSessionIsStoppedAtTheStart() {
    Session session = sessionWithMedia();
    assertThat(session.getSessionState()).isEqualTo(SessionState.STOP);
    assertThat(session.playbackOffset(at(10_000))).isEqualTo(Duration.ZERO);
    assertThat(session.inSyncState()).isFalse();
  }

  @Test
  void startWaitsForTheUsersAndThenPlaysAfterTheLeadTime() {
    Session session = sessionWithMedia();

    session.startPlayback();
    assertThat(session.getSessionState()).isEqualTo(SessionState.PLAY);
    assertThat(session.enterSync()).isPositive();
    assertThat(session.getSessionState()).isEqualTo(SessionState.SYNC_PLAY);
    // nothing runs while the users load the media
    assertThat(session.playbackOffset(at(3_000))).isEqualTo(Duration.ZERO);

    Instant start = session.finishSync(at(3_000), LEAD);

    assertThat(start).isEqualTo(at(3_500));
    assertThat(session.getSessionState()).isEqualTo(SessionState.PLAY);
    // the start lies in the future: no progress yet, not a negative one
    assertThat(session.playbackOffset(at(3_200))).isEqualTo(Duration.ZERO);
    assertThat(session.playbackOffset(at(4_500))).isEqualTo(Duration.ofMillis(1_000));
  }

  @Test
  void pauseKeepsThePositionAndResumeContinuesFromIt() {
    Session session = playing(0);

    Duration paused = session.pausePlayback(at(1_500));
    assertThat(paused).isEqualTo(Duration.ofMillis(1_000));
    assertThat(session.getSessionState()).isEqualTo(SessionState.PAUSE);
    assertThat(session.playbackOffset(at(60_000))).isEqualTo(Duration.ofMillis(1_000));

    Instant start = session.resumePlayback(at(60_000), LEAD);
    assertThat(start).isEqualTo(at(60_500));
    assertThat(session.getSessionState()).isEqualTo(SessionState.PLAY);
    assertThat(session.playbackOffset(at(61_500))).isEqualTo(Duration.ofMillis(2_000));
  }

  @Test
  void aSecondResumeDoesNotMoveTheClock() {
    Session session = playing(0);
    session.pausePlayback(at(1_500));
    session.resumePlayback(at(10_000), LEAD);

    // two users pressed play at the same time
    Instant second = session.resumePlayback(at(12_000), LEAD);

    assertThat(second).isNull();
    assertThat(session.getSessionState()).isEqualTo(SessionState.PLAY);
    assertThat(session.playbackOffset(at(12_500))).isEqualTo(Duration.ofMillis(3_000));
  }

  @Test
  void aStoppedSessionHasNothingToResume() {
    Session session = sessionWithMedia();

    assertThat(session.resumePlayback(at(0), LEAD)).isNull();

    assertThat(session.getSessionState()).isEqualTo(SessionState.STOP);
    assertThat(session.playbackOffset(at(5_000))).isEqualTo(Duration.ZERO);
  }

  @Test
  void resumeDuringASyncRoundOnlyMarksThePlayback() {
    Session session = playing(0);
    session.pausePlayback(at(1_500));
    session.seekBy(10_000, at(2_000));
    session.enterSync();
    assertThat(session.getSessionState()).isEqualTo(SessionState.SYNC_PAUSE);

    assertThat(session.resumePlayback(at(2_100), LEAD)).isNull();
    assertThat(session.getSessionState()).isEqualTo(SessionState.SYNC_PLAY);

    assertThat(session.finishSync(at(2_400), LEAD)).isEqualTo(at(2_900));
    assertThat(session.playbackOffset(at(3_900))).isEqualTo(Duration.ofMillis(12_000));
  }

  @Test
  void seekStopsTheClockAtTheNewPosition() {
    Session session = playing(0);

    Duration position = session.seekBy(30_000, at(2_500));

    assertThat(position).isEqualTo(Duration.ofMillis(32_000));
    assertThat(session.playbackOffset(at(9_000))).isEqualTo(Duration.ofMillis(32_000));
    // still playing: after the sync round the playback goes on
    session.enterSync();
    assertThat(session.getSessionState()).isEqualTo(SessionState.SYNC_PLAY);

    assertThat(session.seekBy(-2_000, at(9_500))).isEqualTo(Duration.ofMillis(30_000));
  }

  @Test
  void aPausedOrStoppedSessionStaysSoAfterItsSyncRound() {
    Session paused = playing(0);
    paused.pausePlayback(at(1_500));
    paused.enterSync();
    assertThat(paused.finishSync(at(2_000), LEAD)).isNull();
    assertThat(paused.getSessionState()).isEqualTo(SessionState.PAUSE);

    Session stopped = sessionWithMedia();
    stopped.enterSync();
    assertThat(stopped.getSessionState()).isEqualTo(SessionState.SYNC_STOP);
    assertThat(stopped.finishSync(at(2_000), LEAD)).isNull();
    assertThat(stopped.getSessionState()).isEqualTo(SessionState.STOP);
  }

  @Test
  void pauseDuringASyncRoundCancelsThePendingPlayback() {
    Session session = sessionWithMedia();
    session.startPlayback();
    session.enterSync();

    session.pausePlayback(at(100));

    assertThat(session.getSessionState()).isEqualTo(SessionState.PAUSE);
    assertThat(session.inSyncState()).isFalse();
    // the timeout of the round finds a session that is not waiting any more
    assertThat(session.finishSync(at(5_000), LEAD)).isNull();
    assertThat(session.getSessionState()).isEqualTo(SessionState.PAUSE);
  }

  @Test
  void withoutACurrentMediaThereIsNothingToSync() {
    Session session = new Session("empty");

    assertThat(session.enterSync()).isEqualTo(-1);

    assertThat(session.getSessionState()).isEqualTo(SessionState.STOP);
    assertThat(session.getSessionUserSynchronization().isActive()).isFalse();
  }

  @Test
  void theRoundIsCompleteWhenAllUsersAreReadyForItsMedia() {
    Session session = sessionWithMedia();
    session.getUsers().add(new User(2, "ben", false));
    session.startPlayback();
    session.enterSync();

    assertThat(session.userReady(1, MEDIA)).isFalse();
    // a late report for another media does not count
    assertThat(session.userReady(2, NEXT_MEDIA)).isFalse();
    assertThat(session.allUsersReady()).isFalse();

    assertThat(session.userReady(2, MEDIA)).isTrue();
  }

  @Test
  void theRoundIsCompleteWhenTheUserItWaitedForLeaves() {
    Session session = sessionWithMedia();
    User ben = new User(2, "ben", false);
    session.getUsers().add(ben);
    session.startPlayback();
    session.enterSync();
    session.userReady(1, MEDIA);
    assertThat(session.allUsersReady()).isFalse();

    session.getUsers().remove(ben);

    assertThat(session.allUsersReady()).isTrue();
  }

  @Test
  void readyReportsOutsideARoundAreIgnored() {
    Session session = playing(0);

    assertThat(session.userReady(1, MEDIA)).isFalse();
    assertThat(session.allUsersReady()).isFalse();
    assertThat(session.getSessionState()).isEqualTo(SessionState.PLAY);
  }

  @Test
  void aNewRoundForgetsTheReadyUsersOfThePreviousOne() {
    Session session = sessionWithMedia();
    session.getUsers().add(new User(2, "ben", false));
    session.startPlayback();
    long first = session.enterSync();
    session.userReady(1, MEDIA);

    long second = session.enterSync();

    assertThat(second).isGreaterThan(first);
    assertThat(session.getSessionState()).isEqualTo(SessionState.SYNC_PLAY);
    assertThat(session.userReady(2, MEDIA)).isFalse();
    assertThat(session.userReady(1, MEDIA)).isTrue();
  }

  @Test
  void theEndOfAMediaOnlyCountsForARunningPlaybackOfThatMedia() {
    Session session = playing(0);

    // a client that is still at the end of the previous media reports right after the start
    assertThat(session.hasPlayed(MEDIA, 2_000, at(1_000))).isFalse();
    assertThat(session.hasPlayed(MEDIA, 2_000, at(2_500))).isTrue();
    assertThat(session.hasPlayed(NEXT_MEDIA, 2_000, at(2_500))).isFalse();

    session.pausePlayback(at(3_000));
    assertThat(session.hasPlayed(MEDIA, 2_000, at(4_000))).isFalse();
  }

  @Test
  void changingTheMediaResetsThePosition() {
    Session session = playing(0);
    assertThat(session.playbackOffset(at(5_500))).isEqualTo(Duration.ofMillis(5_000));

    session.nextMedia();

    assertThat(session.getQueue().getCurrentMedia().getId()).isEqualTo(NEXT_MEDIA);
    assertThat(session.playbackOffset(at(9_000))).isEqualTo(Duration.ZERO);
    // still playing: the next media starts after its sync round
    assertThat(session.getSessionState()).isEqualTo(SessionState.PLAY);

    session.previousMedia();
    assertThat(session.getQueue().getCurrentMedia().getId()).isEqualTo(MEDIA);

    session.skipTo(1);
    assertThat(session.getQueue().getCurrentMedia().getId()).isEqualTo(NEXT_MEDIA);
  }

  @Test
  void stopForgetsThePosition() {
    Session session = playing(0);

    session.stopPlayback();

    assertThat(session.getSessionState()).isEqualTo(SessionState.STOP);
    assertThat(session.playbackOffset(at(9_000))).isEqualTo(Duration.ZERO);
  }

  @Test
  void mediaAreAddedInFairOrderOnlyWithTheFairQueueMode() {
    Session session = sessionWithMedia();
    session.addMedia(List.of(new Media(21)), 1L);
    assertThat(session.getQueue().getQueuedMedia().getLast().media().getId()).isEqualTo(21);

    session.setFairQueue(true);
    session.addMedia(List.of(new Media(31)), 2L);

    // user 1 is playing and had a turn: the first media of user 2 goes before the next ones of user 1
    assertThat(session.getQueue().getQueuedMedia().stream().map(queued -> queued.media().getId()).toList())
        .containsExactly(31L, NEXT_MEDIA, 21L);
  }
}
