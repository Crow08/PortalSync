package de.crow08.portalsync.model.playlists;

import de.crow08.portalsync.model.users.AuthenticatedUser;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * Who may change a playlist: its owners and admins, and everyone if the ownership of the playlist is public. For everyone
 * else a playlist is read only. Who may manage the owners and the public flag is narrower: only the owners and admins.
 */
@Component
public class PlaylistAccess {

  private final PlaylistRepository playlistRepository;

  public PlaylistAccess(PlaylistRepository playlistRepository) {
    this.playlistRepository = playlistRepository;
  }

  /** The user of the current request. */
  public static AuthenticatedUser currentUser() {
    return (AuthenticatedUser) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
  }

  /** Whether the current user may change the songs of the playlist. */
  public boolean canEdit(Playlist playlist) {
    return playlist.isPublicOwnership() || canManage(playlist);
  }

  /** Whether the current user may change the owners of the playlist and whether it is public. */
  public boolean canManage(Playlist playlist) {
    AuthenticatedUser user = currentUser();
    return user.isAdmin() || playlist.isOwnedBy(user.getId());
  }

  /** The playlist, if it exists and the current user may change its songs. */
  public Playlist requireEditable(long playlistId) {
    Playlist playlist = find(playlistId);
    if (!canEdit(playlist)) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only an owner of the playlist or an admin can change it");
    }
    return playlist;
  }

  /** The playlist, if it exists and the current user may manage its owners. */
  public Playlist requireManageable(long playlistId) {
    Playlist playlist = find(playlistId);
    if (!canManage(playlist)) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only an owner of the playlist or an admin can manage it");
    }
    return playlist;
  }

  private Playlist find(long playlistId) {
    return playlistRepository.findById(playlistId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Playlist not found"));
  }
}
