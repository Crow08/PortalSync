package de.crow08.portalsync.model.queue;

import de.crow08.portalsync.model.media.Media;

/**
 * A media in the queue or history of a session together with the user who added it (see {@link Queue#addFair}).
 *
 * @param media   the queued media
 * @param addedBy id of the user who added it, null if unknown
 */
public record QueueEntry(Media media, Long addedBy) {
}
