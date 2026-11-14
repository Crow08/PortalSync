package de.crow08.portalsync.sessions;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

class SessionRepositoryTest {

  @Test
  void sessionsCreatedAtTheSameTimeGetDifferentIds() throws InterruptedException {
    SessionRepository repository = new SessionRepository();
    int threads = 8;
    int sessionsPerThread = 500;
    Set<Long> ids = ConcurrentHashMap.newKeySet();
    CountDownLatch start = new CountDownLatch(1);
    ExecutorService executor = Executors.newFixedThreadPool(threads);
    for (int t = 0; t < threads; t++) {
      executor.submit(() -> {
        start.await();
        for (int i = 0; i < sessionsPerThread; i++) {
          Session session = new Session("concurrent");
          repository.save(session);
          ids.add(session.getId());
        }
        return null;
      });
    }
    start.countDown();
    executor.shutdown();
    assertThat(executor.awaitTermination(30, TimeUnit.SECONDS)).isTrue();

    assertThat(ids).hasSize(threads * sessionsPerThread);
    List<Session> all = new ArrayList<>();
    repository.findAll().forEach(all::add);
    assertThat(all).hasSize(threads * sessionsPerThread);
  }

  @Test
  void savingAgainKeepsTheIdAndASessionWithAnIdMovesTheSequence() {
    SessionRepository repository = new SessionRepository();
    Session first = new Session("first");
    repository.save(first);
    repository.save(first);
    assertThat(first.getId()).isEqualTo(1);

    Session withId = new Session("with id");
    withId.setId(41);
    repository.save(withId);

    Session next = new Session("next");
    repository.save(next);
    assertThat(next.getId()).isEqualTo(42);
    assertThat(repository.findById(41)).contains(withId);
  }
}
