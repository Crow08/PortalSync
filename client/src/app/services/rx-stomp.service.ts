import { Injectable } from '@angular/core';
import { RxStomp } from '@stomp/rx-stomp';

/** The STOMP client of the app. It is configured in `SessionService` with `WsConfigService.myRxStompConfig`. */
@Injectable({ providedIn: 'root' })
export class RxStompService extends RxStomp {
  constructor() {
    super();
  }
}
