import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { User } from '../models/user';
import { environment } from '../../environments/environment';

const STORAGE_KEY = 'currentUser';

/** The user as the server answers a login. */
interface UserDTO {
  id: number;
  username: string;
  admin?: boolean;
}

/**
 * The login of the user. The server logs the browser in with a cookie that scripts can not read (HttpOnly); the browser
 * sends it with every request to the server and with the WebSocket handshake (see authInterceptor). The client only
 * remembers who is logged in (id, name, admin) to show the right pages, never the password.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthenticationService {
  private currentUserSubject: BehaviorSubject<User | null>;
  /** The logged in user, null after the logout; emits the current user to new subscribers. */
  readonly currentUserChanges: Observable<User | null>;

  constructor(private http: HttpClient) {
    this.currentUserSubject = new BehaviorSubject<User | null>(AuthenticationService.readStoredUser());
    this.currentUserChanges = this.currentUserSubject.asObservable();
  }

  public get currentUserValue(): User | null {
    return this.currentUserSubject.value;
  }

  /**
   * The user remembered from the last visit. Whether the login still exists is known with the first request: the
   * server answers 401 without it and the client forgets the user (see authInterceptor).
   */
  private static readStoredUser(): User | null {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (!stored || typeof stored.id !== 'number' || typeof stored.username !== 'string') {
        return null;
      }
      const user = new User(stored.id, stored.username, !!stored.admin);
      // earlier versions kept the password here: only the fields above are written back
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      return user;
    } catch {
      return null;
    }
  }

  login(username: string, password: string): Observable<User> {
    return this.http.post<UserDTO>(`${environment.dbServer}/api/v1/auth/login`, { username, password }).pipe(
      map((userDTO) => {
        const user = new User(userDTO.id, userDTO.username, !!userDTO.admin);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        this.currentUserSubject.next(user);
        return user;
      })
    );
  }

  /** Changes the password of the logged in user. This browser stays logged in, all others of the user are logged out. */
  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.put<void>(`${environment.dbServer}/api/v1/users/password`, { currentPassword, newPassword });
  }

  /** Ends the login on the server (which removes the cookie) and in the client. */
  logout(): void {
    // the client is logged out in any case: without the server the cookie stays, but nothing shows the user any more
    this.http.post(`${environment.dbServer}/api/v1/auth/logout`, null).subscribe({ error: console.error });
    this.forgetLogin();
  }

  /** Forgets the user without telling the server, e.g. when the server does not know the login any more. */
  forgetLogin(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.currentUserSubject.next(null);
  }
}
