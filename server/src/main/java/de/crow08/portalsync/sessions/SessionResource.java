package de.crow08.portalsync.sessions;

import de.crow08.portalsync.model.playlists.Playlist;
import de.crow08.portalsync.model.playlists.PlaylistRepository;
import de.crow08.portalsync.model.users.AuthenticatedUser;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

@RestController
@RequestMapping("/api/v1/sessions")
public class SessionResource {

  final SessionController sessionController;
  private final SessionRepository sessionRepository;
  private final PlaylistRepository playlistRepository;

  @Autowired
  public SessionResource(SessionRepository sessionRepository, PlaylistRepository playlistRepository, SessionController sessionController) {
    this.sessionRepository = sessionRepository;
    this.playlistRepository = playlistRepository;
    this.sessionController = sessionController;
  }

  @GetMapping("/{id}")
  public @ResponseBody Optional<Session> getSession(@PathVariable String id) {
    return sessionRepository.findById(Long.parseLong(id));
  }

  @GetMapping("/all")
  public @ResponseBody Iterable<Session> getSessions() {
    return sessionRepository.findAll();
  }

  @PostMapping(path = "/")
  public @ResponseBody long createNewSession(@RequestBody String name) {
    Session session = this.sessionController.createNewSession(name, getCurrentUser().getId());
    return session.getId();
  }

  /**
   * Deletes the session and kicks everyone still in it. Only the creator of the session and admins may do that.
   */
  @DeleteMapping("/{id}")
  public void deleteSession(@PathVariable long id) {
    Session session = sessionRepository.findById(id)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found"));
    AuthenticatedUser user = getCurrentUser();
    if (!user.isAdmin() && user.getId() != session.getCreatorId()) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the creator or an admin can delete a session");
    }
    sessionController.deleteSession(session);
  }

  private static AuthenticatedUser getCurrentUser() {
    return (AuthenticatedUser) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
  }

  @PutMapping(path = "/{sessionId}/addpl")
  public void addSongsToPlaylist(@PathVariable String sessionId, @RequestBody String playlistId) {
    Optional<Session> session = sessionRepository.findById(Long.parseLong(sessionId));
    Optional<Playlist> playlist = playlistRepository.findById(Long.parseLong(playlistId));
    if (session.isPresent() && playlist.isPresent()) {
      sessionController.addMedia(session.get(), playlist.get().getSongs());
    }
  }
}
