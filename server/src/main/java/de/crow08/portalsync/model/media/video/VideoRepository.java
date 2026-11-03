package de.crow08.portalsync.model.media.video;

import org.springframework.data.repository.CrudRepository;
import org.springframework.data.repository.PagingAndSortingRepository;

public interface VideoRepository extends CrudRepository<Video, Long>, PagingAndSortingRepository<Video, Long> {
}
