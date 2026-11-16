package de.crow08.portalsync.model.series;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** The series videos belong to, like the artists of songs: listed to choose from, created when one is missing. */
@RestController
@RequestMapping("/api/v1/series")
public class SeriesResource {

  private final SeriesRepository seriesRepository;

  public SeriesResource(SeriesRepository seriesRepository) {
    this.seriesRepository = seriesRepository;
  }

  @GetMapping("/all")
  public @ResponseBody Iterable<Series> getSeries() {
    return seriesRepository.findAll();
  }

  @PostMapping(path = "/")
  public @ResponseBody long createNewSeries(@RequestBody String name) {
    if (name == null || name.isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A series needs a name");
    }
    return seriesRepository.save(new Series(name.trim())).getId();
  }
}
