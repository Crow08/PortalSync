# PortalSync

Synchronized group listening and watching: everyone in a lobby plays the same song or video at the same moment, with
shared queue, playlists, library and per-user playback status. Music and video files come from your own media library;
Spotify playback is optional.

- `server/` – Spring Boot 4 (Java 27, Maven, MySQL/MariaDB), REST + STOMP over WebSocket
- `client/` – Angular 22 + Angular Material single page app

## Quick start with Docker

Needs Docker. Client and server are built into one image.

```sh
cp .env.example .env        # set MYSQL_PASSWORD, MYSQL_ROOT_PASSWORD and URLCRYPTO_SECRET (openssl rand -hex 32)
docker compose up -d --build
```

The app is then on <http://localhost:8080>. The media library is the folder `MEDIA_DIR` (default `./media`), mounted at
`/media`. `docker compose --profile tls up -d` adds Caddy with automatic HTTPS for `PORTALSYNC_DOMAIN`.

### First admin

The database starts empty and users join through invites, so the first admin is created by hand. Generate a bcrypt hash
(e.g. `htpasswd -bnBC 10 "" 'your-password' | tr -d ':\n'`) and insert it after the app created the tables:

```sh
docker compose exec -T db mysql -u root -p portalsync -e \
  "INSERT INTO user (username, password, admin) VALUES ('admin', '{bcrypt}<hash>', true);"
```

Further users are created in the app via invite links.

## Development

Requirements: JDK 27, Maven, Node 24, a MySQL/MariaDB database `music_stream_server`, and `SPOTIFY_CLIENT_ID` /
`SPOTIFY_CLIENT_SECRET` in the environment (the values may be empty if you do not use Spotify).

```sh
# server, profile dev, http://127.0.0.1:8081
cd server && mvn spring-boot:run

# client, http://127.0.0.1:4200  (use 127.0.0.1, not localhost: Spotify rejects localhost as redirect URI)
cd client && npm ci && npm start
```

Set `client.storage-path` (`application-dev.properties`, must end with a slash) to your media folder. The `dev` profile
uses `ddl-auto=update` on a persistent database; never drop it to "reset".

Other commands (in `client/`):

| Command               | Purpose                                                                       |
|-----------------------|-------------------------------------------------------------------------------|
| `npm run lint`        | ESLint                                                                        |
| `npm run build`       | production build                                                              |
| `npm run buildServer` | production build copied into the server's `static/`                           |
| `npm run e2e`         | Playwright tests against a throwaway Docker stack (needs Docker and `ffmpeg`) |

## Production profile

The Docker image runs the Spring profile `prod`; the same profile works without Docker (`java -jar target/portalsync-server.war
--spring.profiles.active=prod`). It is configured only by environment variables: `MYSQL_PASSWORD` and `URLCRYPTO_SECRET`
(required), `CLIENT_ORIGIN` (e.g. `https://portalsync.example.org`, default `http://localhost:8080`), `MYSQL_HOST`
(default `localhost`), `MYSQL_DATABASE`, `MYSQL_USER`, `MEDIA_PATH` (ends with a slash, default `/media/`), `SERVER_PORT` and
`SPOTIFY_*`. For HTTPS, `Caddyfile` (`PORTALSYNC_DOMAIN`, `tools/start-caddy.ps1` on Windows) is a ready TLS proxy.

## Background pictures

The optional pictures behind the pages are not part of the repository. Without them thesettings offer only the gradient 
of the theme. How to add your own: `client/src/assets/backgrounds/README.md`.

## Media

Videos must be progressive MP4 (8-bit H.264 + AAC, `moov` atom at the front) so seeking works.
`tools/convert-video.ps1` converts other formats with ffmpeg, burns in subtitles and generates the seek-bar
thumbnail sprite (`Get-Help .\tools\convert-video.ps1 -Full`).
