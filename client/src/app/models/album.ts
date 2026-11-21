import { GenericDataObject } from './genericDataObject';

export class Album extends GenericDataObject {
  /** When the album was released: a year, a month or a day (see utils/release-date.ts), null if unknown. */
  releaseDate: string | null = null;
}
