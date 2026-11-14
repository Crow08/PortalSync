import { Client } from '@stomp/stompjs';
import { BASE_URL } from '../env';
import { Account, basic } from './api';

export interface RawStomp {
  client: Client;
  /** Messages received on the private error queue (`/user/queue/errors`). */
  errors: { message?: string; destination?: string }[];
  close(): Promise<void>;
}

/** A bare STOMP connection without the app, as a user who did not join the room (session header "0"). */
export async function connectStomp(user: Account): Promise<RawStomp> {
  const client = new Client({
    brokerURL: BASE_URL.replace(/^http/, 'ws') + '/ws',
    connectHeaders: { session: '0' },
    reconnectDelay: 0,
    // The user is logged in by the handshake, an HTTP request: the browser sends its login cookie, this script HTTP
    // Basic. The WebSocket of Node (undici) takes headers in an options object, which the DOM types do not know.
    webSocketFactory: () =>
      new WebSocket(BASE_URL.replace(/^http/, 'ws') + '/ws', {
        protocols: ['v12.stomp', 'v11.stomp', 'v10.stomp'],
        headers: { Authorization: basic(user.username, user.password) },
      } as never),
  });
  const errors: RawStomp['errors'] = [];
  await new Promise<void>((resolve, reject) => {
    client.onConnect = () => {
      client.subscribe('/user/queue/errors', (message) => errors.push(JSON.parse(message.body)));
      // the server sends no receipt for subscriptions; give it a moment so a fast command is not answered unheard
      setTimeout(resolve, 500);
    };
    client.onStompError = (frame) => reject(new Error(`STOMP error: ${frame.headers['message']}`));
    client.onWebSocketError = () => reject(new Error('WebSocket error'));
    client.activate();
  });
  return { client, errors, close: () => client.deactivate() };
}
