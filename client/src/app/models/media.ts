import { Tag } from './tag';

export class Media {
  id: number;
  type: 'SONG' | 'VIDEO';
  title: string;
  uri: string;
  tags: Tag[];
  /** Id of the user who uploaded or imported the media, null if unknown. Only the owner and admins may change it. */
  ownerId: number | null = null;
  /** Whether the media has a picture (the cover of its album), see coverUrl. */
  hasCover = false;
  /** The picture if it lies on another server (the cover of a Spotify song at Spotify), null otherwise. */
  coverUrl: string | null = null;

  constructor(id: number, type: 'SONG' | 'VIDEO', title: string, uri: string, tags: Tag[]) {
    this.id = id;
    this.type = type;
    this.title = title;
    this.uri = uri;
    this.tags = tags;
  }
}
