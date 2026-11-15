package de.crow08.portalsync.wscommunication.commands;

import de.crow08.portalsync.model.media.MediaType;
import de.crow08.portalsync.model.media.MinimalMedia;
import de.crow08.portalsync.model.users.User;
import de.crow08.portalsync.sessions.Session;
import de.crow08.portalsync.sessions.UserStatus;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The JSON of the commands is the protocol between server and client. The client declares the same fields as types in
 * {@code client/src/app/models/session-command.ts}: when a test here fails because a command changed, change those
 * types (and {@code PlayerEngineService.processCommand}) as well.
 */
class CommandJsonTest {

  private static final JsonMapper MAPPER = new JsonMapper();

  private static final MinimalMedia SONG = new MinimalMedia(7, "a song", MediaType.SONG);
  private static final QueueSnapshot SNAPSHOT = new QueueSnapshot(List.of(SONG), List.of(SONG, SONG), 42);

  private static JsonNode json(Command command) {
    return MAPPER.valueToTree(command);
  }

  private static List<String> fields(JsonNode node) {
    return new ArrayList<>(node.propertyNames());
  }

  @Test
  void startAndResume() {
    JsonNode start = json(new StartCommand(1000));
    assertThat(fields(start)).containsExactlyInAnyOrder("type", "startServerTime");
    assertThat(start.get("type").asString()).isEqualTo("Start");
    assertThat(start.get("startServerTime").asLong()).isEqualTo(1000);

    JsonNode resume = json(new ResumeCommand(2000));
    assertThat(fields(resume)).containsExactlyInAnyOrder("type", "startServerTime");
    assertThat(resume.get("type").asString()).isEqualTo("Resume");
  }

  @Test
  void setMedia() {
    JsonNode setMedia = json(new SetMediaCommand(SONG, SNAPSHOT));
    assertThat(fields(setMedia)).containsExactlyInAnyOrder("type", "currentMedia", "queue", "history", "queueVersion");
    assertThat(setMedia.get("type").asString()).isEqualTo("SetMedia");
    assertThat(setMedia.get("queueVersion").asLong()).isEqualTo(42);
    assertThat(setMedia.get("queue")).hasSize(1);
    assertThat(setMedia.get("history")).hasSize(2);

    JsonNode media = setMedia.get("currentMedia");
    assertThat(fields(media)).containsExactlyInAnyOrder("id", "title", "type");
    assertThat(media.get("type").asString()).isEqualTo("SONG");
  }

  @Test
  void pauseStopJumpLeaveAndTheCommandsWithoutFields() {
    JsonNode pause = json(new PauseCommand(1500));
    assertThat(fields(pause)).containsExactlyInAnyOrder("type", "mediaStopTime");
    assertThat(pause.get("type").asString()).isEqualTo("Pause");

    JsonNode jump = json(new JumpCommand(30_000));
    assertThat(fields(jump)).containsExactlyInAnyOrder("type", "startMediaTime");
    assertThat(jump.get("type").asString()).isEqualTo("Jump");

    JsonNode leave = json(new LeaveCommand(3));
    assertThat(fields(leave)).containsExactlyInAnyOrder("type", "userId");
    assertThat(leave.get("type").asString()).isEqualTo("Leave");

    assertThat(fields(json(new SessionDeletedCommand()))).containsExactly("type");
    assertThat(json(new SessionDeletedCommand()).get("type").asString()).isEqualTo("SessionDeleted");
    assertThat(fields(json(new NopCommand()))).containsExactly("type");
    assertThat(json(new NopCommand()).get("type").asString()).isEqualTo("Nop");
  }

  @Test
  void stopCarriesTheQueueOnlyAtItsEnd() {
    JsonNode plain = json(new StopCommand());
    assertThat(fields(plain)).containsExactlyInAnyOrder("type", "queue", "history", "queueVersion");
    assertThat(plain.get("type").asString()).isEqualTo("Stop");
    // the client tells the end of the queue by the history
    assertThat(plain.get("history").isNull()).isTrue();
    assertThat(plain.get("queue").isNull()).isTrue();
    assertThat(plain.get("queueVersion").isNull()).isTrue();

    JsonNode atTheEnd = json(new StopCommand(SNAPSHOT));
    assertThat(atTheEnd.get("history")).hasSize(2);
    assertThat(atTheEnd.get("queueVersion").asLong()).isEqualTo(42);
  }

  @Test
  void join() {
    UserStatus status = new UserStatus(3, UserStatus.State.READY, 12, -4);
    JsonNode join = json(new JoinCommand(3, SONG, SNAPSHOT, Session.SessionState.SYNC_PLAY, true, false, 5000, 1200,
        List.of(new User(3, "anna", false)), List.of(status)));
    assertThat(fields(join)).containsExactlyInAnyOrder("type", "userId", "currentMedia", "queue", "history", "queueVersion",
        "sessionUsers", "userStatuses", "sessionState", "loopMode", "fairQueue", "startServerTime", "startMediaTime",
        "isVideo");
    assertThat(join.get("type").asString()).isEqualTo("Join");
    assertThat(join.get("sessionState").asString()).isEqualTo("SYNC_PLAY");
    assertThat(join.get("queueVersion").asLong()).isEqualTo(42);

    // the password of a user never leaves the server
    assertThat(fields(join.get("sessionUsers").get(0))).containsExactlyInAnyOrder("id", "username", "admin");
    assertThat(fields(join.get("userStatuses").get(0))).containsExactlyInAnyOrder("userId", "state", "latency", "drift");
    assertThat(join.get("userStatuses").get(0).get("state").asString()).isEqualTo("READY");
  }

  @Test
  void theStatesOfASessionAreTheOnesTheClientKnows() {
    assertThat(Session.SessionState.values()).extracting(Enum::name)
        .containsExactlyInAnyOrder("PLAY", "STOP", "PAUSE", "SYNC_PLAY", "SYNC_STOP", "SYNC_PAUSE");
  }

  @Test
  void updates() {
    JsonNode loop = json(new UpdateLoopModeCommand(true));
    assertThat(fields(loop)).containsExactlyInAnyOrder("type", "updateType", "loopMode");
    assertThat(loop.get("type").asString()).isEqualTo("Update");
    assertThat(loop.get("updateType").asString()).isEqualTo("LoopMode");

    JsonNode fair = json(new UpdateFairQueueCommand(true));
    assertThat(fields(fair)).containsExactlyInAnyOrder("type", "updateType", "fairQueue");
    assertThat(fair.get("updateType").asString()).isEqualTo("FairQueue");

    JsonNode queue = json(new UpdateQueueCommand(SNAPSHOT));
    assertThat(fields(queue)).containsExactlyInAnyOrder("type", "updateType", "queue", "queueVersion");
    assertThat(queue.get("updateType").asString()).isEqualTo("Queue");

    JsonNode history = json(new UpdateHistoryCommand(SNAPSHOT));
    assertThat(fields(history)).containsExactlyInAnyOrder("type", "updateType", "history", "queueVersion");
    assertThat(history.get("updateType").asString()).isEqualTo("History");

    JsonNode both = json(new UpdateQueueAndHistoryCommand(SNAPSHOT));
    assertThat(fields(both)).containsExactlyInAnyOrder("type", "updateType", "queue", "history", "queueVersion");
    assertThat(both.get("updateType").asString()).isEqualTo("QueueAndHistory");

    JsonNode userStatus = json(new UpdateUserStatusCommand(new UserStatus(3, UserStatus.State.LOADING, null, null)));
    assertThat(fields(userStatus)).containsExactlyInAnyOrder("type", "updateType", "userStatus");
    assertThat(userStatus.get("updateType").asString()).isEqualTo("UserStatus");
  }

  @Test
  void errorsGoOnlyToTheSender() {
    JsonNode error = json(new ErrorCommand("Session not found", "/app/sessions/1/commands/skip"));
    assertThat(fields(error)).containsExactlyInAnyOrder("type", "message", "destination");
    assertThat(error.get("type").asString()).isEqualTo("Error");
  }
}
