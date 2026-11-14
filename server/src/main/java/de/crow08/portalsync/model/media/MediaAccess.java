package de.crow08.portalsync.model.media;

import de.crow08.portalsync.model.playlists.PlaylistAccess;
import de.crow08.portalsync.model.users.AuthenticatedUser;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * Who may edit and delete a media: its owner (the user who uploaded or imported it) and admins. Media without an owner
 * (added before owners existed or by SQL) are changed by admins only. Everyone may read and play all media.
 */
@Component
public class MediaAccess {

  /** Whether the current user may edit and delete the media. */
  public boolean canChange(Media media) {
    AuthenticatedUser user = PlaylistAccess.currentUser();
    return user.isAdmin() || (media.getOwnerId() != null && media.getOwnerId() == user.getId());
  }

  /** Rejects the request with 403 if the current user may not edit and delete the media. */
  public void requireChangeable(Media media) {
    if (!canChange(media)) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner of the media or an admin can change it");
    }
  }

  /** The id of the current user, the owner of the media it adds. */
  public long currentUserId() {
    return PlaylistAccess.currentUser().getId();
  }
}
