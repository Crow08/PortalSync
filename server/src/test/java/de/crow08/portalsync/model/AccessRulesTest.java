package de.crow08.portalsync.model;

import de.crow08.portalsync.model.media.Media;
import de.crow08.portalsync.model.media.MediaAccess;
import de.crow08.portalsync.model.playlists.Playlist;
import de.crow08.portalsync.model.playlists.PlaylistAccess;
import de.crow08.portalsync.model.playlists.PlaylistRepository;
import de.crow08.portalsync.model.users.AuthenticatedUser;
import de.crow08.portalsync.model.users.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Who may change what: the rules of {@link MediaAccess} and {@link PlaylistAccess} for the logged in user. */
class AccessRulesTest {

  private static final User OWNER = new User(1, "owner", false);
  private static final User OTHER = new User(2, "other", false);
  private static final User ADMIN = new User(9, "admin", true);

  private static void loggedInAs(User user) {
    AuthenticatedUser principal = new AuthenticatedUser(user);
    SecurityContextHolder.getContext()
        .setAuthentication(UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities()));
  }

  private static void assertStatus(Runnable action, HttpStatus status) {
    assertThatThrownBy(action::run)
        .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode()).isEqualTo(status));
  }

  @AfterEach
  void logOut() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void onlyAdminsHaveTheAdminRole() {
    assertThat(new AuthenticatedUser(OWNER).getAuthorities()).extracting(GrantedAuthority::getAuthority)
        .containsExactly("ROLE_USER");
    assertThat(new AuthenticatedUser(ADMIN).getAuthorities()).extracting(GrantedAuthority::getAuthority)
        .containsExactlyInAnyOrder("ROLE_USER", "ROLE_ADMIN");
    assertThat(new AuthenticatedUser(ADMIN).getId()).isEqualTo(9);
    assertThat(new AuthenticatedUser(ADMIN).isAdmin()).isTrue();
  }

  @Nested
  class MediaRules {

    private final MediaAccess access = new MediaAccess();

    private Media ownedBy(Long userId) {
      Media media = new Media(5);
      media.setOwnerId(userId);
      return media;
    }

    @Test
    void theOwnerChangesItsMedia() {
      loggedInAs(OWNER);
      assertThat(access.canChange(ownedBy(1L))).isTrue();
      access.requireChangeable(ownedBy(1L));
      assertThat(access.currentUserId()).isEqualTo(1);
    }

    @Test
    void anotherUserDoesNot() {
      loggedInAs(OTHER);
      assertThat(access.canChange(ownedBy(1L))).isFalse();
      assertStatus(() -> access.requireChangeable(ownedBy(1L)), HttpStatus.FORBIDDEN);
    }

    @Test
    void anAdminChangesEveryMedia() {
      loggedInAs(ADMIN);
      assertThat(access.canChange(ownedBy(1L))).isTrue();
      assertThat(access.canChange(ownedBy(null))).isTrue();
    }

    @Test
    void mediaWithoutAnOwnerAreLeftToAdmins() {
      loggedInAs(OWNER);
      assertThat(access.canChange(ownedBy(null))).isFalse();
      assertStatus(() -> access.requireChangeable(ownedBy(null)), HttpStatus.FORBIDDEN);
    }
  }

  @Nested
  class PlaylistRules {

    private final PlaylistRepository repository = mock(PlaylistRepository.class);
    private final PlaylistAccess access = new PlaylistAccess(repository);

    private Playlist playlist(boolean publicOwnership) {
      Playlist playlist = new Playlist("mix", OWNER);
      playlist.setPublicOwnership(publicOwnership);
      when(repository.findById(4L)).thenReturn(Optional.of(playlist));
      return playlist;
    }

    @Test
    void theAuthorIsTheFirstOwner() {
      Playlist playlist = playlist(false);
      assertThat(playlist.isOwnedBy(1)).isTrue();
      assertThat(playlist.isOwnedBy(2)).isFalse();
      assertThat(new Playlist().isOwnedBy(1)).isFalse();
    }

    @Test
    void anOwnerChangesAndManagesThePlaylist() {
      Playlist playlist = playlist(false);
      loggedInAs(OWNER);
      assertThat(access.canEdit(playlist)).isTrue();
      assertThat(access.canManage(playlist)).isTrue();
      assertThat(access.requireEditable(4)).isSameAs(playlist);
      assertThat(access.requireManageable(4)).isSameAs(playlist);
    }

    @Test
    void forEveryoneElseAPlaylistIsReadOnly() {
      Playlist playlist = playlist(false);
      loggedInAs(OTHER);
      assertThat(access.canEdit(playlist)).isFalse();
      assertThat(access.canManage(playlist)).isFalse();
      assertStatus(() -> access.requireEditable(4), HttpStatus.FORBIDDEN);
      assertStatus(() -> access.requireManageable(4), HttpStatus.FORBIDDEN);
    }

    @Test
    void aSecondOwnerHasTheSameRights() {
      Playlist playlist = playlist(false);
      playlist.getOwners().add(OTHER);
      loggedInAs(OTHER);
      assertThat(access.canEdit(playlist)).isTrue();
      assertThat(access.canManage(playlist)).isTrue();
    }

    @Test
    void aPublicPlaylistIsChangedByEverybodyButManagedByItsOwners() {
      Playlist playlist = playlist(true);
      loggedInAs(OTHER);
      assertThat(access.canEdit(playlist)).isTrue();
      assertThat(access.requireEditable(4)).isSameAs(playlist);
      assertThat(access.canManage(playlist)).isFalse();
      assertStatus(() -> access.requireManageable(4), HttpStatus.FORBIDDEN);
    }

    @Test
    void anAdminChangesAndManagesEveryPlaylist() {
      Playlist playlist = playlist(false);
      loggedInAs(ADMIN);
      assertThat(access.canEdit(playlist)).isTrue();
      assertThat(access.canManage(playlist)).isTrue();
    }

    @Test
    void aPlaylistThatDoesNotExistIsNotFound() {
      when(repository.findById(77L)).thenReturn(Optional.empty());
      loggedInAs(ADMIN);
      assertStatus(() -> access.requireEditable(77), HttpStatus.NOT_FOUND);
      assertStatus(() -> access.requireManageable(77), HttpStatus.NOT_FOUND);
    }
  }
}
