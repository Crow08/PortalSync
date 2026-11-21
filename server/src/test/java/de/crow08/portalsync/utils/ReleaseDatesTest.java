package de.crow08.portalsync.utils;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReleaseDatesTest {

  @Test
  void aDateIsAYearAMonthOrADay() {
    assertThat(ReleaseDates.normalize("1998")).isEqualTo("1998");
    assertThat(ReleaseDates.normalize("1998-10")).isEqualTo("1998-10");
    assertThat(ReleaseDates.normalize("1998-10-12")).isEqualTo("1998-10-12");
    assertThat(ReleaseDates.normalize(" 2000-02-29 ")).isEqualTo("2000-02-29");
  }

  @Test
  void noDateIsNull() {
    assertThat(ReleaseDates.normalize(null)).isNull();
    assertThat(ReleaseDates.normalize("")).isNull();
    assertThat(ReleaseDates.normalize("  ")).isNull();
  }

  @Test
  void everythingElseIsRefused() {
    for (String date : new String[] {"98", "19980", "1998-1", "1998-13", "1998-00", "1998-02-30", "2001-02-29",
        "1998-10-12T00:00", "12.10.1998", "1998/10/12", "0000", "0999", "next year", "1998-10-"}) {
      assertThatThrownBy(() -> ReleaseDates.normalize(date)).as(date).isInstanceOf(IllegalArgumentException.class);
    }
  }

  @Test
  void anImportLeavesOutWhatIsNoDate() {
    assertThat(ReleaseDates.lenient("1981-12")).contains("1981-12");
    assertThat(ReleaseDates.lenient("unknown")).isEmpty();
    assertThat(ReleaseDates.lenient(null)).isEmpty();
  }
}
