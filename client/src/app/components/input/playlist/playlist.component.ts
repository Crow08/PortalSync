import { Component, Input, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ObjectSelectInputData } from '../../util/object-select/object-select.component';
import { AddObjectInputData } from '../../util/add-object-button/add-object-button.component';
import { HttpHelperService } from '../../../services/http-helper.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ServerResultErrorSnackBarComponent } from '../../messages/server-result-error-snack-bar.component';
import { InputObjectDirective } from '../input-object.directive';
import { Playlist } from '../../../models/playlist';
import { GenericDataObject } from '../../../models/genericDataObject';
import { AuthenticationService } from '../../../services/authentication.service';

@Component({
    selector: 'app-input-playlist',
    templateUrl: '../input-object.component.html',
    styleUrls: ['../input-object.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class PlaylistComponent extends InputObjectDirective implements OnInit {
  @Input() override multiMode = true;

  constructor(
    httpHelperService: HttpHelperService,
    private snackBar: MatSnackBar,
    private authenticationService: AuthenticationService
  ) {
    super(httpHelperService, true);
  }

  ngOnInit(): void {
    this.addObjectInputData = new AddObjectInputData(
      'Playlist',
      [{ displayName: 'Name', key: 'name', value: '' }],
      '/api/v1/playlists/'
    );
    this.getData();
  }

  objectAdded(): void {
    this.getData();
  }

  private getData(): void {
    super
      .getDataForSelect('/api/v1/playlists/all', Playlist)
      .then((value) => {
        this.selectObjectData = new ObjectSelectInputData(
          'Playlist',
          // songs are only added to playlists the user may change, the others are read only
          value
            .filter((object) => object.canEdit(this.authenticationService.currentUserValue))
            .map((object) => new GenericDataObject(object.id, object.name))
        );
      })
      .catch(() =>
        this.snackBar.openFromComponent(ServerResultErrorSnackBarComponent, {
          duration: 2000,
        })
      );
  }
}
