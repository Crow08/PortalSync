package de.crow08.portalsync.model.playlists;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface PlaylistRepository extends CrudRepository<Playlist, Long> {

  /** The playlists that contain at least one of the media. */
  @Query("SELECT DISTINCT p FROM Playlist p JOIN p.media m WHERE m.id IN :mediaIds")
  List<Playlist> findContainingAny(@Param("mediaIds") Collection<Long> mediaIds);
}
