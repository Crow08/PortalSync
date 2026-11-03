package de.crow08.portalsync.wscommunication;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.stereotype.Controller;

import java.time.Instant;

@Controller
public class UtilityController {

  @MessageMapping("/util/latency/{user}")
  @SendTo("/topic/util/latency/{user}")
  public String ping(String message) {
    return String.valueOf(Instant.now().toEpochMilli());
  }
}
