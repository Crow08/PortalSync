package de.crow08.portalsync.authentication;

import de.crow08.portalsync.authentication.LoginTokenService.Login;
import de.crow08.portalsync.model.users.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class LoginTokenServiceTest {

  private static final User ANNA = new User(3, "anna", false);

  private LoginTokenRepository repository;
  private LoginTokenService service;

  @BeforeEach
  void setUp() {
    repository = mock(LoginTokenRepository.class);
    service = new LoginTokenService(repository);
  }

  private LoginToken stored(String token, Duration expiresIn) {
    LoginToken login = new LoginToken(LoginTokenService.hash(token), ANNA, Instant.now().plus(expiresIn));
    when(repository.findByTokenHash(LoginTokenService.hash(token))).thenReturn(Optional.of(login));
    return login;
  }

  @Test
  void theHashIsSha256AsHex() {
    assertThat(LoginTokenService.hash("abc")).isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  }

  @Test
  void aLoginStoresTheHashNeverTheToken() {
    String token = service.create(ANNA);

    ArgumentCaptor<LoginToken> saved = ArgumentCaptor.forClass(LoginToken.class);
    verify(repository).save(saved.capture());
    assertThat(saved.getValue().getTokenHash()).isEqualTo(LoginTokenService.hash(token)).isNotEqualTo(token);
    assertThat(saved.getValue().getUser()).isSameAs(ANNA);
    assertThat(saved.getValue().getExpiresAt())
        .isCloseTo(Instant.now().plus(LoginTokenService.LIFETIME), within(Duration.ofSeconds(10)));
  }

  @Test
  void aTokenIsLongRandomAndFitsIntoACookie() {
    String first = service.create(ANNA);
    String second = service.create(ANNA);

    // 32 random bytes as base64url without padding
    assertThat(first).hasSize(43).matches("[A-Za-z0-9_-]+");
    assertThat(second).isNotEqualTo(first);
  }

  @Test
  void aNewLoginRemovesTheLoginsThatHaveEnded() {
    service.create(ANNA);

    ArgumentCaptor<Instant> before = ArgumentCaptor.forClass(Instant.class);
    verify(repository).deleteByExpiresAtBefore(before.capture());
    assertThat(before.getValue()).isCloseTo(Instant.now(), within(Duration.ofSeconds(10)));
  }

  @Test
  void aTokenFindsItsUser() {
    stored("token", LoginTokenService.LIFETIME);

    Optional<Login> login = service.find("token");

    assertThat(login).isPresent();
    assertThat(login.get().user()).isSameAs(ANNA);
  }

  @Test
  void anUnknownTokenFindsNobody() {
    when(repository.findByTokenHash(anyString())).thenReturn(Optional.empty());

    assertThat(service.find("unknown")).isEmpty();
  }

  @Test
  void whatCanNotBeATokenIsNotEvenLookedUp() {
    assertThat(service.find(null)).isEmpty();
    assertThat(service.find("")).isEmpty();
    assertThat(service.find("   ")).isEmpty();
    assertThat(service.find("x".repeat(101))).isEmpty();
    service.revoke(null);
    service.revoke("x".repeat(101));

    verifyNoInteractions(repository);
  }

  @Test
  void aLoginThatHasEndedFindsNobodyAndIsRemoved() {
    LoginToken ended = stored("token", Duration.ofSeconds(-1));

    assertThat(service.find("token")).isEmpty();

    verify(repository).delete(ended);
  }

  @Test
  void aLoginUsedOnTheSameDayIsNotWrittenAgain() {
    LoginToken fresh = stored("token", LoginTokenService.LIFETIME.minus(Duration.ofHours(2)));
    Instant expires = fresh.getExpiresAt();

    Login login = service.find("token").orElseThrow();

    assertThat(login.renewed()).isFalse();
    assertThat(fresh.getExpiresAt()).isEqualTo(expires);
    verify(repository, never()).save(any());
  }

  @Test
  void aLoginUsedDaysLaterLivesTheWholeLifetimeAgain() {
    LoginToken old = stored("token", Duration.ofDays(20));

    Login login = service.find("token").orElseThrow();

    assertThat(login.renewed()).isTrue();
    assertThat(old.getExpiresAt()).isCloseTo(Instant.now().plus(LoginTokenService.LIFETIME), within(Duration.ofSeconds(10)));
    verify(repository).save(old);
  }

  @Test
  void aLoginIsExtendedOnceLessThanTheLifetimeMinusADayIsLeft() {
    Instant now = Instant.parse("2026-01-01T12:00:00Z");
    Duration lifetime = LoginTokenService.LIFETIME;

    assertThat(LoginTokenService.needsRenewal(now.plus(lifetime), now)).isFalse();
    assertThat(LoginTokenService.needsRenewal(now.plus(lifetime.minus(Duration.ofHours(23))), now)).isFalse();
    assertThat(LoginTokenService.needsRenewal(now.plus(lifetime.minus(Duration.ofHours(25))), now)).isTrue();
    assertThat(LoginTokenService.needsRenewal(now.plus(Duration.ofMinutes(1)), now)).isTrue();
  }

  @Test
  void theLogoutRemovesTheLoginOfTheToken() {
    service.revoke("token");

    verify(repository).deleteByTokenHash(LoginTokenService.hash("token"));
  }

  @Test
  void aChangedPasswordEndsTheOtherLoginsOfTheUser() {
    service.revokeOthers(3, "token");

    verify(repository).deleteByUserIdAndTokenHashNot(3, LoginTokenService.hash("token"));
    verify(repository, never()).deleteByUserId(3);
  }

  @Test
  void withoutALoginToKeepAllLoginsOfTheUserEnd() {
    service.revokeOthers(3, null);

    verify(repository).deleteByUserId(3);
  }
}
