import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';

/**
 * The rating of the current media: a single star that expands to five stars on hover or keyboard focus. Once the user rated
 * the media, the expanded stars show the rating instead of following the mouse. Clicking the current rating again removes it.
 */
@Component({
    selector: 'app-rating-star',
    templateUrl: './rating-star.component.html',
    styleUrls: ['./rating-star.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class RatingStarComponent {
  @Input() currentRating!: number;
  @Input() songRating!: number;
  @Output() rating = new EventEmitter<number>();

  readonly stars = [1, 2, 3, 4, 5];
  /** The star under the mouse, 0 if none: it previews the rating. */
  hovered = 0;

  /** Whether the user rated the media: the stars then show the rating, without following the mouse. */
  get rated(): boolean {
    return this.currentRating > 0;
  }

  /** The number of filled stars: the rating, or the star under the mouse while there is no rating. */
  get shown(): number {
    return this.rated ? this.currentRating : this.hovered;
  }

  /** Clicking the rating again takes it back, which is a rating of 0. */
  public setRatingValue(newRating: number): void {
    // the parent owns the rating: changing the input here would stick when the parent's value does not change
    this.rating.emit(newRating === this.currentRating ? 0 : newRating);
  }

  title(star: number): string {
    if (star === this.currentRating) {
      return 'Remove your rating';
    }
    return star === 1 && this.currentRating === 0 ? 'Rate this' : `Rate ${star} of ${this.stars.length}`;
  }
}
