package de.crow08.portalsync.authentication;

import org.springframework.data.repository.CrudRepository;

import java.time.Instant;
import java.util.Optional;

public interface LoginTokenRepository extends CrudRepository<LoginToken, Long> {

  Optional<LoginToken> findByTokenHash(String tokenHash);

  long deleteByTokenHash(String tokenHash);

  long deleteByExpiresAtBefore(Instant time);

  long deleteByUserId(long userId);

  long deleteByUserIdAndTokenHashNot(long userId, String tokenHash);
}
