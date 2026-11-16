package de.crow08.portalsync.model.season;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** The seasons videos belong to, like the albums of songs: listed to choose from, created when one is missing. */
@RestController
@RequestMapping("/api/v1/seasons")
public class SeasonResource {

  private final SeasonRepository seasonRepository;

  public SeasonResource(SeasonRepository seasonRepository) {
    this.seasonRepository = seasonRepository;
  }

  @GetMapping("/all")
  public @ResponseBody Iterable<Season> getSeasons() {
    return seasonRepository.findAll();
  }

  @PostMapping(path = "/")
  public @ResponseBody long createNewSeason(@RequestBody String name) {
    if (name == null || name.isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A season needs a name");
    }
    return seasonRepository.save(new Season(name.trim())).getId();
  }
}
