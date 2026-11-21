package de.crow08.portalsync.utils;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The release date of a song or an album. Often only the year is known (the folder of an album, the tag of a file),
 * Spotify knows the year, the month or the day: so the date is a text, as exact as it is known: "1998", "1998-10" or
 * "1998-10-12". The texts sort like the dates.
 */
public final class ReleaseDates {

  private static final Pattern FORMAT = Pattern.compile("(\\d{4})(?:-(\\d{2})(?:-(\\d{2}))?)?");

  private ReleaseDates() {
  }

  /**
   * The date as it is stored: null for none (null or blank), else the text without spaces around it.
   *
   * @throws IllegalArgumentException if the text is no year, month or day
   */
  public static String normalize(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    String date = value.trim();
    Matcher matcher = FORMAT.matcher(date);
    if (!matcher.matches()) {
      throw new IllegalArgumentException("A release date is a year, a month or a day: 1998, 1998-10 or 1998-10-12");
    }
    int year = Integer.parseInt(matcher.group(1));
    int month = matcher.group(2) == null ? 1 : Integer.parseInt(matcher.group(2));
    int day = matcher.group(3) == null ? 1 : Integer.parseInt(matcher.group(3));
    try {
      LocalDate.of(year, month, day);
    } catch (DateTimeException e) {
      throw new IllegalArgumentException("There is no such date: " + date);
    }
    if (year < 1000) {
      throw new IllegalArgumentException("There is no such year: " + date);
    }
    return date;
  }

  /** The date of an import, where a date that is none is left out and does not stop the import. */
  public static Optional<String> lenient(String value) {
    try {
      return Optional.ofNullable(normalize(value));
    } catch (IllegalArgumentException e) {
      return Optional.empty();
    }
  }
}
