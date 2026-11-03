package de.crow08.portalsync.model.media;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.repository.PagingAndSortingRepository;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface MediaRepository extends CrudRepository<Media, Long>, PagingAndSortingRepository<Media, Long> {
  List<Media> findByTitleContains(String keyword);

  Optional<Media> findFirstByUri(String uri);

  // JPQL instead of native SQL: Song inherits from Media (JOINED), so "song.*" would miss the media columns
  @Query("SELECT s FROM Song s WHERE s.artist.id IN :ids")
  List<Media> findByArtist(@Param("ids") List<Long> ids);

  @Query("SELECT DISTINCT s FROM Song s JOIN s.genres g WHERE g.id IN :ids")
  List<Media> findByGenre(@Param("ids") List<Long> ids);
}
