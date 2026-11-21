package de.crow08.portalsync.model.media;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Optional;

/**
 * The covers that are no file in the storage but a picture on another server: the cover of a Spotify song is the URL
 * Spotify names for its album, the browsers load it from there. The URL comes from the client that imports the song,
 * so only what is a picture of Spotify's image server is taken.
 */
public final class CoverUrls {

  /** The server of the album pictures of Spotify. */
  private static final String SPOTIFY_IMAGE_HOST = "i.scdn.co";

  private CoverUrls() {
  }

  /** Whether the cover of a media is a URL and no file in the storage. */
  public static boolean isExternal(String cover) {
    return cover != null && cover.startsWith("https://");
  }

  /**
   * The URL if it is a picture of Spotify: https, their image server and nothing else (no port, login, query or
   * fragment); empty for everything else.
   */
  public static Optional<String> spotifyImage(String url) {
    if (url == null || url.length() > 255) {
      return Optional.empty();
    }
    try {
      URI uri = new URI(url);
      boolean plain = uri.getPort() == -1 && uri.getRawUserInfo() == null && uri.getRawQuery() == null
          && uri.getRawFragment() == null;
      return "https".equals(uri.getScheme()) && SPOTIFY_IMAGE_HOST.equals(uri.getHost()) && plain
          && uri.getRawPath() != null && uri.getRawPath().matches("/image/[A-Za-z0-9]+")
          ? Optional.of(url)
          : Optional.empty();
    } catch (URISyntaxException e) {
      return Optional.empty();
    }
  }
}
