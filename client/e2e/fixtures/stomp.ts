import { Client } from '@stomp/stompjs';
import { BASE_URL } from '../env';
import { Account } from './api';

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
    connectHeaders: { login: user.username, usercode: user.password, session: '0' },
    reconnectDelay: 0,
    webSocketFactory: () => new WebSocket(BASE_URL.replace(/^http/, 'ws') + '/ws', ['v12.stomp', 'v11.stomp', 'v10.stomp']),
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
