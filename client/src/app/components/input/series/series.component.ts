import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ObjectSelectInputData } from '../../util/object-select/object-select.component';
import { AddObjectInputData } from '../../util/add-object-button/add-object-button.component';
import { InputObjectDirective } from '../input-object.directive';
import { HttpHelperService } from '../../../services/http-helper.service';
import { ServerResultErrorSnackBarComponent } from '../../messages/server-result-error-snack-bar.component';
import { Series } from '../../../models/series';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GenericDataObject } from '../../../models/genericDataObject';

@Component({
  selector: 'app-input-series',
  templateUrl: '../input-object.component.html',
  styleUrls: ['../input-object.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SeriesComponent extends InputObjectDirective implements OnInit {
  constructor(httpHelperService: HttpHelperService, private snackBar: MatSnackBar) {
    super(httpHelperService, false);
  }

  ngOnInit(): void {
    this.addObjectInputData = new AddObjectInputData(
      'inputs.series',
      [{ displayName: 'inputs.name', key: 'name', value: '' }],
      '/api/v1/series/'
    );
    this.getData();
  }

  objectAdded(): void {
    this.getData();
  }

  private getData(): void {
    super
      .getDataForSelect('/api/v1/series/all', Series)
      .then((value) => {
        this.selectObjectData = new ObjectSelectInputData(
          'inputs.series',
          value.map((object) => new GenericDataObject(object.id, object.name))
        );
      })
      .catch(() =>
        this.snackBar.openFromComponent(ServerResultErrorSnackBarComponent, {
          duration: 2000,
        })
      );
  }
}
