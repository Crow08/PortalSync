import { Injectable } from '@angular/core';
import { RxStompConfig } from '@stomp/rx-stomp';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class WsConfigService {
  /** Headers of the STOMP CONNECT. The user is not among them: the WebSocket handshake carries the login cookie. */
  configParameter = {
    session: '0',
  };

  constructor() {}

  updateWsConfig(config: { session?: number }): void {
    if (config.session) {
      this.configParameter.session = String(config.session);
    }
  }

  myRxStompConfig(): RxStompConfig {
    return {
      // Which server?
      brokerURL: `${environment.wsServer}/ws`,

      // Headers
      // Typical keys: login, passcode, host
      connectHeaders: this.configParameter,

      // How often to heartbeat?
      // Interval in milliseconds, set to 0 to disable
      heartbeatIncoming: 0, // Typical value 0 - disabled
      heartbeatOutgoing: 20000, // Typical value 20000 - every 20 seconds

      // Wait in milliseconds before attempting auto reconnect
      // Set to 0 to disable
      // Typical value 500 milliseconds
      reconnectDelay: 5000,

      // Will log diagnostics on console
      // It can be quite verbose, not recommended in production
      // Skip this key to stop logging to console
      debug: (msg: string): void => {},
    };
  }
}
