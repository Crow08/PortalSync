import { Component, ChangeDetectionStrategy } from '@angular/core';

/** The rooms page: all rooms, creating a room and inviting someone. */
@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class HomeComponent {}
