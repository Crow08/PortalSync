package de.crow08.portalsync.sessions;

import org.springframework.data.repository.Repository;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * The sessions, in memory only. Requests are handled concurrently: two sessions created at the same time must not get
 * the same id (one would replace the other and its users would end up in a foreign session).
 */
@Component
public class SessionRepository implements Repository<Session, Long> {

  private final Map<Long, Session> repo = new ConcurrentHashMap<>();
  private final AtomicLong idSequencer = new AtomicLong(1);

  public Optional<Session> findById(long id) {
    return Optional.ofNullable(repo.get(id));
  }

  public void save(Session session) {
    long sessionId = getSessionId(session);
    repo.put(sessionId, session);
  }

  public void delete(Session session) {
    repo.remove(session.getId());
  }

  public Iterable<Session> findAll() {
    return repo.values();
  }

  private long getSessionId(Session session) {
    long sessionId = session.getId();
    if (sessionId == 0) {
      sessionId = idSequencer.getAndIncrement();
      session.setId(sessionId);
    } else {
      // a session that brings its own id: the next new one gets a higher id
      idSequencer.accumulateAndGet(sessionId + 1, Math::max);
    }
    return sessionId;
  }
}
