package de.crow08.portalsync.model.media.video;

import de.crow08.portalsync.model.media.MediaRepository;
import de.crow08.portalsync.model.playlists.PlaylistRepository;
import de.crow08.portalsync.model.season.SeasonRepository;
import de.crow08.portalsync.model.series.SeriesRepository;
import de.crow08.portalsync.model.tag.Tag;
import de.crow08.portalsync.model.tag.TagRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Adds an uploaded video to the library. Its own class because a converted video is added by the thread of the video
 * jobs, long after the request: there is no logged in user then, so the owner is passed in, and whether the user may
 * change the playlists was checked when the upload arrived.
 */
@Component
public class VideoRegistration {

  /** What the uploader chose for the video, all by id; a series, season, tag or playlist that is gone is left out. */
  public record Details(Long seriesId, Long seasonId, List<Long> tagIds, List<Long> playlistIds) {
  }

  private final MediaRepository mediaRepository;
  private final SeriesRepository seriesRepository;
  private final SeasonRepository seasonRepository;
  private final TagRepository tagRepository;
  private final PlaylistRepository playlistRepository;

  public VideoRegistration(MediaRepository mediaRepository, SeriesRepository seriesRepository,
                           SeasonRepository seasonRepository, TagRepository tagRepository,
                           PlaylistRepository playlistRepository) {
    this.mediaRepository = mediaRepository;
    this.seriesRepository = seriesRepository;
    this.seasonRepository = seasonRepository;
    this.tagRepository = tagRepository;
    this.playlistRepository = playlistRepository;
  }

  @Transactional
  public Video register(String title, String uri, long ownerId, Details details) {
    Video video = new Video(title, uri);
    // the uploader owns the video: only the owner and admins may edit and delete it
    video.setOwnerId(ownerId);
    if (details.seriesId() != null) {
      video.setSeries(seriesRepository.findById(details.seriesId()).orElse(null));
    }
    if (details.seasonId() != null) {
      video.setSeason(seasonRepository.findById(details.seasonId()).orElse(null));
    }
    Set<Tag> tags = new HashSet<>();
    tagRepository.findAllById(details.tagIds()).forEach(tags::add);
    video.setTags(tags);
    Video saved = mediaRepository.save(video);

    for (long playlistId : details.playlistIds()) {
      playlistRepository.findById(playlistId).ifPresent(playlist -> {
        if (playlist.getSongs() == null) {
          playlist.setSongs(new ArrayList<>());
        }
        playlist.getSongs().add(saved);
        playlistRepository.save(playlist);
      });
    }
    return saved;
  }
}
