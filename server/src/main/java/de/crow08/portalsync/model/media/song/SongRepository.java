package de.crow08.portalsync.model.media.song;

import org.springframework.data.repository.CrudRepository;
import org.springframework.data.repository.PagingAndSortingRepository;

public interface SongRepository extends CrudRepository<Song, Long>, PagingAndSortingRepository<Song, Long> {
}
