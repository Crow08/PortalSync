package de.crow08.portalsync.model.media;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import de.crow08.portalsync.model.album.Album;
import de.crow08.portalsync.model.album.AlbumRepository;
import de.crow08.portalsync.model.artist.Artist;
import de.crow08.portalsync.model.artist.ArtistRepository;
import de.crow08.portalsync.model.genre.Genre;
import de.crow08.portalsync.model.genre.GenreRepository;
import de.crow08.portalsync.model.media.song.Song;
import de.crow08.portalsync.model.media.song.SongRepository;
import de.crow08.portalsync.model.media.video.Video;
import de.crow08.portalsync.model.media.video.VideoRepository;
import de.crow08.portalsync.model.playlists.Playlist;
import de.crow08.portalsync.model.playlists.PlaylistAccess;
import de.crow08.portalsync.model.playlists.PlaylistRepository;
import de.crow08.portalsync.model.tag.Tag;
import de.crow08.portalsync.model.season.Season;
import de.crow08.portalsync.model.season.SeasonRepository;
import de.crow08.portalsync.model.series.Series;
import de.crow08.portalsync.model.series.SeriesRepository;
import de.crow08.portalsync.model.tag.TagRepository;
import de.crow08.portalsync.utils.MediaFiles;
import de.crow08.portalsync.utils.ReleaseDates;
import de.crow08.portalsync.utils.Mp4ChapterReader;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

@RestController
@RequestMapping("/api/v1/media")
public class MediaResource {

  private final MediaRepository mediaRepository;

  private final SongRepository songRepository;

  private final VideoRepository videoRepository;

  private final ArtistRepository artistRepository;

  private final PlaylistRepository playlistRepository;

  private final PlaylistAccess playlistAccess;

  private final MediaAccess mediaAccess;

  private final MediaFileRemover mediaFileRemover;

  private final MediaDeletion mediaDeletion;

  private final GenreRepository genreRepository;
  private final AlbumRepository albumRepository;
  private final TagRepository tagRepository;
  private final SeriesRepository seriesRepository;
  private final SeasonRepository seasonRepository;

  private final Path storagePath;

  @Autowired
  public MediaResource(MediaRepository mediaRepository,
                       SongRepository songRepository,
                       VideoRepository videoRepository,
                       ArtistRepository artistRepository,
                       PlaylistRepository playlistRepository,
                       PlaylistAccess playlistAccess,
                       MediaAccess mediaAccess,
                       MediaFileRemover mediaFileRemover,
                       MediaDeletion mediaDeletion,
                       GenreRepository genreRepository,
                       AlbumRepository albumRepository,
                       TagRepository tagRepository,
                       SeriesRepository seriesRepository,
                       SeasonRepository seasonRepository,
                       @Value("${client.storage-path}") String clientStoragePath) {
    this.mediaRepository = mediaRepository;
    this.songRepository = songRepository;
    this.videoRepository = videoRepository;
    this.artistRepository = artistRepository;
    this.playlistRepository = playlistRepository;
    this.playlistAccess = playlistAccess;
    this.mediaAccess = mediaAccess;
    this.mediaFileRemover = mediaFileRemover;
    this.mediaDeletion = mediaDeletion;
    this.genreRepository = genreRepository;
    this.albumRepository = albumRepository;
    this.tagRepository = tagRepository;
    this.seriesRepository = seriesRepository;
    this.seasonRepository = seasonRepository;
    storagePath = Paths.get(clientStoragePath);
  }

  @PostMapping("/upload/")
  @Transactional
  public @ResponseBody ResponseEntity<Resource> uploadSong(@RequestParam("files") MultipartFile[] files,
                                                           @RequestParam("data") String data) throws IOException {
    JsonMapper mapper = new JsonMapper();
    JsonNode dataNode = mapper.readTree(data);

    long artistId = 1; // 1 is Fallback
    if (dataNode.get("artistId") != null && dataNode.get("artistId").isNumber()) {
      artistId = dataNode.get("artistId").longValue();
    }

    long albumId = 1; // 1 is Fallback
    if (dataNode.get("albumId") != null && dataNode.get("albumId").isNumber()) {
      albumId = dataNode.get("albumId").longValue();
    }

    List<Long> playlistIds = new ArrayList<>();
    if (dataNode.get("playlists").isArray()) {
      for (JsonNode jsonNode : dataNode.get("playlists")) {
        playlistIds.add(jsonNode.asLong());
      }
    }
    // songs are only added to playlists the user may change; one that is not allowed fails the whole request
    playlistIds.forEach(playlistAccess::requireEditable);

    List<Long> genreIds = new ArrayList<>();
    if (dataNode.get("genres").isArray()) {
      for (JsonNode jsonNode : dataNode.get("genres")) {
        genreIds.add(jsonNode.asLong());
      }
    }

    List<Long> tagIds = new ArrayList<>();
    if (dataNode.get("tags").isArray()) {
      for (JsonNode jsonNode : dataNode.get("tags")) {
        tagIds.add(jsonNode.asLong());
      }
    }

    Optional<Artist> artist = artistRepository.findById(artistId);
    Optional<Album> album = albumRepository.findById(albumId);
    Iterable<Genre> genres = genreRepository.findAllById(genreIds);
    Iterable<Tag> tags = tagRepository.findAllById(tagIds);

    for (MultipartFile mpFile : files) {
      // only the plain name is used: a path in the name must not place the file outside the directory of the artist
      String fileName = MediaFiles.fileName(mpFile.getOriginalFilename())
          .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid file name"));
      String songPath = "/songs/" + artistId;
      Path fullPath = Paths.get(this.storagePath.toString(), songPath);
      // Create new song
      Song song = new Song(fileName, songPath + "/" + fileName);
      // the uploader owns the song: only the owner and admins may edit and delete it
      song.setOwnerId(mediaAccess.currentUserId());
      // Add artist
      song.setArtist(artist.orElse(null));
      // Add album
      song.setAlbum(album.orElse(null));
      // Add genres
      Set<Genre> genresList = new HashSet<>();
      genres.forEach(genresList::add);
      song.setGenres(genresList);
      // Add tags
      Set<Tag> tagsList = new HashSet<>();
      tags.forEach(tagsList::add);
      song.setTags(tagsList);
      // Save song
      mediaRepository.save(song);

      //write Song file
      Files.createDirectories(fullPath);
      File file = new File(fullPath.toAbsolutePath().toString(), fileName);
      if (!file.createNewFile()) {
        mediaRepository.delete(song);
        return new ResponseEntity<>(HttpStatus.CONFLICT);
      }
      mpFile.transferTo(file);

      // Add to playlist
      for (long playlistId : playlistIds) {
        Optional<Playlist> playlist = playlistRepository.findById(playlistId);
        playlist.ifPresent(pl -> {
          if (pl.getSongs() == null) {
            pl.setSongs(new ArrayList<>());
          }
          pl.getSongs().add(song);
          playlistRepository.save(pl);
        });
      }
    }
    return new ResponseEntity<>(HttpStatus.OK);
  }

  @PostMapping("/import/")
  @Transactional
  public @ResponseBody ResponseEntity<Resource> importSongs(@RequestBody String data) throws IOException {
    JsonMapper mapper = new JsonMapper();
    JsonNode dataNode = mapper.readTree(data);

    ArrayList<Media> newSongs = new ArrayList<>();
    HashMap<String, Artist> artistCache = new HashMap<>();
    HashMap<String, Album> albumCache = new HashMap<>();
    for (JsonNode songNode : dataNode.get("songs")) {
      if (!this.isValidImportSong(songNode)) {
        System.err.println("Error: Import is skipping invalid song.");
        continue;
      }

      // A Spotify song is only added once: importing it again only adds it to the playlists
      if (songNode.path("spotify").asBoolean(false) && songNode.hasNonNull("uri")) {
        Optional<Media> existing = mediaRepository.findFirstByUri(songNode.get("uri").asString())
            .filter(media -> media instanceof Song && ((Song) media).isSpotify());
        if (existing.isPresent()) {
          // songs imported before there were covers get theirs when they are imported again
          if (!existing.get().hasCover()) {
            spotifyCover(songNode).ifPresent(cover -> {
              existing.get().setCover(cover);
              mediaRepository.save(existing.get());
            });
          }
          // the same for the release date, also of the album
          Song existingSong = (Song) existing.get();
          Optional<String> date = releaseDate(songNode);
          if (existingSong.getReleaseDate() == null && date.isPresent()) {
            existingSong.setReleaseDate(date.get());
            mediaRepository.save(existingSong);
          }
          dateAlbum(existingSong.getAlbum(), date);
          newSongs.add(existing.get());
          continue;
        }
      }

      // every other song is a file: its uri has to be a path inside the storage directory
      if (!songNode.path("spotify").asBoolean(false)
          && MediaFiles.resolve(storagePath, songNode.path("uri").asString("")).isEmpty()) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid uri of a song");
      }

      JsonNode artistNode = songNode.get("artist");
      long artistId = 1; // 1 is Fallback
      if (artistNode.get("id") != null && artistNode.get("id").isNumber()) {
        artistId = artistNode.get("id").longValue();
      } else if (artistNode.get("name") != null && artistNode.get("name").isString()) {
        String artistName = artistNode.get("name").asString();
        if (artistCache.containsKey(artistName)) {
          artistId = artistCache.get(artistName).getId();
        } else {
          List<Artist> artistQueryResult = artistRepository.findByName(artistName);
          Artist artist = artistQueryResult.size() == 0
              ? artistRepository.save(new Artist(artistName))
              : artistQueryResult.get(0);
          artistId = artist.getId();
          artistCache.put(artistName, artist);
        }
      }

      JsonNode albumNode = songNode.get("album");
      long albumId = 1; // 1 is Fallback
      if (albumNode.get("id") != null && albumNode.get("id").isNumber()) {
        albumId = albumNode.get("id").longValue();
      } else if (albumNode.get("name") != null && albumNode.get("name").isString()) {
        String albumName = albumNode.get("name").asString();
        if (albumCache.containsKey(albumName)) {
          albumId = albumCache.get(albumName).getId();
        } else {
          List<Album> albumQueryResult = albumRepository.findByName(albumName);
          Album album = albumQueryResult.size() == 0
              ? albumRepository.save(new Album(albumName))
              : albumQueryResult.get(0);
          albumId = album.getId();
          albumCache.put(albumName, album);
        }
      }

      JsonNode genresNode = songNode.get("genres");
      List<Long> genreIds = new ArrayList<>();
      if (genresNode.isArray()) {
        for (JsonNode genreNode : genresNode) {
          genreIds.add(genreNode.get("id").asLong());
        }
      }
      JsonNode tagsNode = songNode.get("tags");
      List<Long> tagIds = new ArrayList<>();
      if (tagsNode.isArray()) {
        for (JsonNode tagNode : tagsNode) {
          tagIds.add(tagNode.get("id").asLong());
        }
      }

      Optional<Artist> artist = artistRepository.findById(artistId);
      Optional<Album> album = albumRepository.findById(albumId);
      Iterable<Genre> genres = genreRepository.findAllById(genreIds);
      Iterable<Tag> tags = tagRepository.findAllById(tagIds);


      // Create new song
      Song song = new Song(songNode.get("title").asString(), songNode.get("uri").asString());
      // A Spotify song is played by the Spotify player of each client, its uri is a Spotify uri and no file
      song.setSpotify(songNode.path("spotify").asBoolean(false));
      if (song.isSpotify()) {
        spotifyCover(songNode).ifPresent(song::setCover);
      }
      Optional<String> releaseDate = releaseDate(songNode);
      song.setReleaseDate(releaseDate.orElse(null));
      // an album without a date gets the one of its first song that has one (Spotify: the date of the album)
      dateAlbum(album.orElse(null), releaseDate);
      // the importer owns the song; a Spotify song that exists already keeps its owner
      song.setOwnerId(mediaAccess.currentUserId());
      // Add artist
      song.setArtist(artist.orElse(null));
      // Add album
      song.setAlbum(album.orElse(null));
      // Add genres
      Set<Genre> genresList = new HashSet<>();
      genres.forEach(genresList::add);
      song.setGenres(genresList);
      // Add tags
      Set<Tag> tagsList = new HashSet<>();
      tags.forEach(tagsList::add);
      song.setTags(tagsList);
      // Save song
      newSongs.add(mediaRepository.save(song));
    }

    List<Long> playlistIds = new ArrayList<>();
    if (dataNode.get("playlists").isArray()) {
      for (JsonNode jsonNode : dataNode.get("playlists")) {
        playlistIds.add(jsonNode.asLong());
      }
    }
    // songs are only added to playlists the user may change; one that is not allowed fails the whole request
    playlistIds.forEach(playlistAccess::requireEditable);

    // Add to playlist
    for (long playlistId : playlistIds) {
      Optional<Playlist> playlist = playlistRepository.findById(playlistId);
      playlist.ifPresent(pl -> {
        if (pl.getSongs() == null) {
          pl.setSongs(new ArrayList<>());
        }
        pl.getSongs().addAll(newSongs);
        playlistRepository.save(pl);
      });
    }

    return new ResponseEntity<>(HttpStatus.OK);
  }

  /** The release date of a song of an import; one that is no date is left out. */
  private static Optional<String> releaseDate(JsonNode songNode) {
    return ReleaseDates.lenient(songNode.path("releaseDate").asString(null));
  }

  /** Gives an album without a release date the date; the fallback album ("Unknown Album", id 1) never gets one. */
  private void dateAlbum(Album album, Optional<String> date) {
    if (album != null && album.getId() != 1 && album.getReleaseDate() == null && date.isPresent()) {
      album.setReleaseDate(date.get());
      albumRepository.save(album);
    }
  }

  /** The cover of a Spotify song of an import: the URL of its picture at Spotify, nothing else is taken. */
  private static Optional<String> spotifyCover(JsonNode songNode) {
    return CoverUrls.spotifyImage(songNode.path("cover").asString(null));
  }

  private boolean isValidImportSong(JsonNode songNode) {
    return songNode.has("title")
        && songNode.has("artist")
        && songNode.has("album")
        && songNode.has("genres")
        && songNode.has("tags");
  }

  @GetMapping("/all")
  public @ResponseBody Page<Media> getSessions(
      @RequestParam("sort") Optional<String> sort,
      @RequestParam("order") Optional<String> order,
      @RequestParam("page") Optional<Integer> page,
      @RequestParam("pageSize") Optional<Integer> pageSize
  ) {
    Pageable pageable;
    if (page.isPresent() && pageSize.isPresent()) {
      if (sort.isPresent() && order.isPresent()) {
        if (order.get().equalsIgnoreCase("desc")) {
          pageable = PageRequest.of(page.get(), pageSize.get(), Sort.by(sort.get()).descending());
        } else {
          pageable = PageRequest.of(page.get(), pageSize.get(), Sort.by(sort.get()).ascending());
        }
      } else {
        pageable = PageRequest.of(page.get(), pageSize.get());
      }
    } else {
      pageable = PageRequest.of(0, Integer.MAX_VALUE);
    }
    Page<Media> result = mediaRepository.findAll(pageable);
    return result;
  }

  @GetMapping("/{id}")
  public @ResponseBody Optional<Media> getMedia(@PathVariable Long id) {
    return mediaRepository.findById(id);
  }

  @GetMapping("/song/{id}")
  public @ResponseBody Optional<Song> getSong(@PathVariable Long id) {
    Optional<Song> byId = songRepository.findById(id);
    return byId;
  }

  @GetMapping("/video/{id}")
  public @ResponseBody Optional<Video> getVideo(@PathVariable Long id) {
    Optional<Video> byId = videoRepository.findById(id);
    return byId;
  }

  /** Chapters of the video file, an empty list if it has none (e.g. a song or a file without chapters). */
  @GetMapping("/video/{id}/chapters")
  public ResponseEntity<List<Mp4ChapterReader.Chapter>> getVideoChapters(@PathVariable Long id) {
    Optional<Video> video = videoRepository.findById(id);
    if (video.isEmpty()) {
      return new ResponseEntity<>(HttpStatus.NOT_FOUND);
    }
    Optional<Path> file = MediaFiles.resolve(storagePath, video.get().getUri()).filter(Files::isReadable);
    if (file.isEmpty()) {
      return new ResponseEntity<>(HttpStatus.NOT_FOUND);
    }
    try {
      return ResponseEntity.ok(Mp4ChapterReader.read(file.get()));
    } catch (IOException e) {
      // chapters are optional: a file that cannot be parsed just has none
      return ResponseEntity.ok(List.of());
    }
  }

  @GetMapping(path = "/getSongsByKeyword/{keyword}")
  public List<Media> getSongsByKeyword(@PathVariable String keyword) {
    List<Media> songs = mediaRepository.findByTitleContains(keyword);
    return songs;
  }

  @GetMapping(path = "/getSongsByArtist/{keyword}")
  public List<Media> getSongsByArtist(@PathVariable List<Long> keyword) {
    return keyword.isEmpty() ? List.of() : mediaRepository.findByArtist(keyword);
  }

  @GetMapping(path = "/getSongsByGenre/{keyword}")
  public List<Media> getSongsByGenre(@PathVariable List<Long> keyword) {
    return keyword.isEmpty() ? List.of() : mediaRepository.findByGenre(keyword);
  }

  @PutMapping(path = "/deleteSongById/{songId}")
  public void deleteSongById(@PathVariable Long songId) {
    Media media = mediaRepository.findById(songId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Song not found"));
    mediaAccess.requireChangeable(media);
    mediaDeletion.delete(List.of(media));
    // after the media is gone from the library: the file of an uploaded song goes with it
    mediaFileRemover.removeFileOf(media);
  }

  @PutMapping(path = "/deleteSongs")
  public void deleteSongs(@RequestBody Media[] toBeDeletedMedia) {
    // all or nothing: one media the user may not delete fails the request before anything is deleted
    List<Media> mediaList = new ArrayList<>();
    for (Media toBeDeleted : toBeDeletedMedia) {
      Media media = mediaRepository.findById(toBeDeleted.getId())
          .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Song not found"));
      mediaAccess.requireChangeable(media);
      mediaList.add(media);
    }
    mediaDeletion.delete(mediaList);
    mediaList.forEach(mediaFileRemover::removeFileOf);
  }

  @PutMapping(path = "/editSong")
  public ResponseEntity<String> editSong(@RequestBody Song alteredSong) {
    Optional<Song> song = this.songRepository.findById(alteredSong.getId());
    if (song.isPresent()) {
      Song originalSong = song.get();
      mediaAccess.requireChangeable(originalSong);
      originalSong.setTitle(requireTitle(alteredSong.getTitle()));
      try {
        originalSong.setReleaseDate(ReleaseDates.normalize(alteredSong.getReleaseDate()));
      } catch (IllegalArgumentException e) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
      }
      originalSong.setArtist(alteredSong.getArtist());
      originalSong.setAlbum(alteredSong.getAlbum());
      originalSong.setGenres(alteredSong.getGenres());
      originalSong.setTags(alteredSong.getTags());
      mediaRepository.save(originalSong);
    } else {
      return new ResponseEntity<>(HttpStatus.NOT_FOUND);
    }
    return new ResponseEntity<>(HttpStatus.OK);
  }

  /**
   * The changes of a video: its title, its series and season (null for none) and its tags. Series, season and tags are
   * given by id and looked up here, nothing else of them is taken from the request.
   */
  public record EditVideoRequest(long id, String title, Long seriesId, Long seasonId, List<Long> tagIds) {
  }

  /** Changes the title, series, season and tags of a video. Only its owner and admins may do that. */
  @PutMapping(path = "/editVideo")
  @Transactional
  public ResponseEntity<Void> editVideo(@RequestBody EditVideoRequest request) {
    Video video = videoRepository.findById(request.id())
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Video not found"));
    mediaAccess.requireChangeable(video);
    video.setTitle(requireTitle(request.title()));
    video.setSeries(request.seriesId() == null ? null : seriesRepository.findById(request.seriesId())
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Series not found")));
    video.setSeason(request.seasonId() == null ? null : seasonRepository.findById(request.seasonId())
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Season not found")));
    Set<Tag> tags = new HashSet<>();
    tagRepository.findAllById(request.tagIds() == null ? List.of() : request.tagIds()).forEach(tags::add);
    video.setTags(tags);
    videoRepository.save(video);
    return ResponseEntity.ok().build();
  }

  /** A media needs a title: the library lists and finds it by it. */
  private static String requireTitle(String title) {
    if (title == null || title.isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A title is required");
    }
    return title.trim();
  }
}
