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
import de.crow08.portalsync.model.tag.TagRepository;
import de.crow08.portalsync.utils.Mp4ChapterReader;
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
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/media")
public class MediaResource {

  private final MediaRepository mediaRepository;

  private final SongRepository songRepository;

  private final VideoRepository videoRepository;

  private final ArtistRepository artistRepository;

  private final PlaylistRepository playlistRepository;

  private final PlaylistAccess playlistAccess;

  private final GenreRepository genreRepository;
  private final AlbumRepository albumRepository;
  private final TagRepository tagRepository;

  private final Path storagePath;

  @Autowired
  public MediaResource(MediaRepository mediaRepository,
                       SongRepository songRepository,
                       VideoRepository videoRepository,
                       ArtistRepository artistRepository,
                       PlaylistRepository playlistRepository,
                       PlaylistAccess playlistAccess,
                       GenreRepository genreRepository,
                       AlbumRepository albumRepository,
                       TagRepository tagRepository,
                       @Value("${client.storage-path}") String clientStoragePath) {
    this.mediaRepository = mediaRepository;
    this.songRepository = songRepository;
    this.videoRepository = videoRepository;
    this.artistRepository = artistRepository;
    this.playlistRepository = playlistRepository;
    this.playlistAccess = playlistAccess;
    this.genreRepository = genreRepository;
    this.albumRepository = albumRepository;
    this.tagRepository = tagRepository;
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
    playlistIds.stream().filter(id -> id > 1).forEach(playlistAccess::requireEditable);

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
      String fileName = Objects.requireNonNull(mpFile.getOriginalFilename());
      String songPath = "/songs/" + artistId;
      Path fullPath = Paths.get(this.storagePath.toString(), songPath);
      // Create new song
      Song song = new Song(fileName, songPath + "/" + fileName);
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
        if (playlistId > 1) { // Don't add to playlist with ID: 1
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
          newSongs.add(existing.get());
          continue;
        }
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
    playlistIds.stream().filter(id -> id > 1).forEach(playlistAccess::requireEditable);

    // Add to playlist
    for (long playlistId : playlistIds) {
      if (playlistId > 1) { // Don't add to playlist with ID: 1
        Optional<Playlist> playlist = playlistRepository.findById(playlistId);
        playlist.ifPresent(pl -> {
          if (pl.getSongs() == null) {
            pl.setSongs(new ArrayList<>());
          }
          pl.getSongs().addAll(newSongs);
          playlistRepository.save(pl);
        });
      }
    }

    return new ResponseEntity<>(HttpStatus.OK);
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
    Path file = Paths.get(storagePath.toString(), video.get().getUri());
    if (!Files.isReadable(file)) {
      return new ResponseEntity<>(HttpStatus.NOT_FOUND);
    }
    try {
      return ResponseEntity.ok(Mp4ChapterReader.read(file));
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
    Media media = mediaRepository.findById(songId).orElseThrow(() -> new RuntimeException("Song not found"));
    media.getPlaylists().forEach(playlist ->
        playlist.setSongs(playlist.getSongs()
            .stream()
            .filter(song1 -> song1.getId() != media.getId())
            .collect(Collectors.toList()))
    );
    mediaRepository.delete(media);
  }

  @PutMapping(path = "/deleteSongs")
  public void deleteSongs(@RequestBody Media[] toBeDeletedMedia) {
    for (Media toBeDeleted : toBeDeletedMedia) {
      Media media = mediaRepository.findById(toBeDeleted.getId()).orElseThrow(() -> new RuntimeException("Song not found"));
      media.getPlaylists().forEach(playlist ->
          playlist.setSongs(playlist.getSongs()
              .stream()
              .filter(song1 -> song1.getId() != media.getId())
              .collect(Collectors.toList()))
      );
      mediaRepository.delete(media);
    }
  }

  @PutMapping(path = "/editSong")
  public ResponseEntity<String> editSong(@RequestBody Song alteredSong) {
    Optional<Song> song = this.songRepository.findById(alteredSong.getId());
    if (song.isPresent()) {
      Song originalSong = song.get();
      originalSong.setTitle(alteredSong.getTitle());
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
}
