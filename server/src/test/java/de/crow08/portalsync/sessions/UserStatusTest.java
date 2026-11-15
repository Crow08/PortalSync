package de.crow08.portalsync.sessions;

import de.crow08.portalsync.sessions.UserStatus.State;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

/** The playback status a client reports about itself: it is shown to the others, so it is not trusted blindly. */
class UserStatusTest {

  private static final int A_DAY = 24 * 60 * 60 * 1000;

  @Test
  void theUserComesFromTheConnectionNotFromTheReport() {
    UserStatus report = new UserStatus(99, State.READY, 20, -5);

    UserStatus status = UserStatus.fromReport(3, report);

    assertThat(status.getUserId()).isEqualTo(3);
    assertThat(status.getState()).isEqualTo(State.READY);
    assertThat(status.getLatency()).isEqualTo(20);
    assertThat(status.getDrift()).isEqualTo(-5);
  }

  @Test
  void valuesOutOfRangeAreClamped() {
    UserStatus status = UserStatus.fromReport(3, new UserStatus(3, State.READY, -50, Integer.MIN_VALUE));
    assertThat(status.getLatency()).isZero();
    assertThat(status.getDrift()).isEqualTo(-A_DAY);

    UserStatus huge = UserStatus.fromReport(3, new UserStatus(3, State.READY, Integer.MAX_VALUE, Integer.MAX_VALUE));
    assertThat(huge.getLatency()).isEqualTo(A_DAY);
    assertThat(huge.getDrift()).isEqualTo(A_DAY);
  }

  @Test
  void missingValuesStayMissingAndAMissingStateIsIdle() {
    UserStatus status = UserStatus.fromReport(3, new UserStatus(3, null, null, null));

    assertThat(status.getState()).isEqualTo(State.IDLE);
    assertThat(status.getLatency()).isNull();
    assertThat(status.getDrift()).isNull();
  }

  @Test
  void theReportOfAClientIsReadWithoutAUserId() {
    UserStatus report = new JsonMapper().readValue("{\"state\":\"LOADING\",\"latency\":12,\"drift\":null}", UserStatus.class);

    assertThat(report.getState()).isEqualTo(State.LOADING);
    assertThat(report.getLatency()).isEqualTo(12);
    assertThat(report.getDrift()).isNull();
  }
}
