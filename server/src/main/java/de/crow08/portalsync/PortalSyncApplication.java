package de.crow08.portalsync;

import de.crow08.portalsync.config.ClientProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;

@SpringBootApplication
@EnableConfigurationProperties(ClientProperties.class)
public class PortalSyncApplication extends SpringBootServletInitializer {

  public static void main(String[] args) {
    SpringApplication.run(PortalSyncApplication.class, args);
  }

}
