package de.crow08.portalsync.model.rating;

import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface RatingRepository extends CrudRepository<Rating, RatingId> {
  @Query(value = "SELECT rating_value FROM `rating` WHERE song_id = ?1", nativeQuery = true)
  List<Short> findRatingsBySongId(long songId);

  /** Deletes the ratings of the media, e.g. before the media are deleted. */
  @Modifying
  @Query("DELETE FROM Rating r WHERE r.id.songId IN :songIds")
  int deleteBySongIds(@Param("songIds") Collection<Long> songIds);
}
