import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { User } from '../models/user';
import { authInterceptor } from './auth.interceptor';
import { AuthenticationService } from './authentication.service';

const server = environment.dbServer;

describe('the login of the client', () => {
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.fn>;

  function setUp(): AuthenticationService {
    navigate = vi.fn(() => Promise.resolve(true));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthenticationService);
  }

  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  describe('AuthenticationService', () => {
    it('starts logged out', () => {
      const service = setUp();

      expect(service.currentUserValue).toBeNull();
    });

    it('sends the password once and remembers only who is logged in', () => {
      const service = setUp();
      let loggedIn: User | undefined;

      service.login('anna', 'secret').subscribe((user) => (loggedIn = user));
      const request = http.expectOne(`${server}/api/v1/auth/login`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ username: 'anna', password: 'secret' });
      request.flush({ id: 3, username: 'anna', admin: true });

      expect(loggedIn).toEqual(new User(3, 'anna', true));
      expect(service.currentUserValue).toEqual(new User(3, 'anna', true));
      expect(JSON.parse(localStorage.getItem('currentUser')!)).toEqual({ id: 3, username: 'anna', admin: true });
      expect(JSON.stringify(localStorage)).not.toContain('secret');
    });

    it('tells its subscribers who is logged in', () => {
      const service = setUp();
      const seen: (string | null)[] = [];
      service.currentUserChanges.subscribe((user) => seen.push(user?.username ?? null));

      service.login('anna', 'secret').subscribe();
      http.expectOne(`${server}/api/v1/auth/login`).flush({ id: 3, username: 'anna' });
      service.logout();
      http.expectOne(`${server}/api/v1/auth/logout`).flush(null);

      expect(seen).toEqual([null, 'anna', null]);
    });

    it('stays logged out after a wrong password', () => {
      const service = setUp();
      let failed = false;

      service.login('anna', 'wrong').subscribe({ error: () => (failed = true) });
      http.expectOne(`${server}/api/v1/auth/login`).flush('', { status: 401, statusText: 'Unauthorized' });

      expect(failed).toBe(true);
      expect(service.currentUserValue).toBeNull();
      expect(localStorage.getItem('currentUser')).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('remembers the user of the last visit', () => {
      localStorage.setItem('currentUser', JSON.stringify({ id: 3, username: 'anna', admin: false }));

      expect(setUp().currentUserValue).toEqual(new User(3, 'anna', false));
    });

    it('removes the password an earlier version kept in the browser', () => {
      localStorage.setItem(
        'currentUser',
        JSON.stringify({ id: 3, username: 'anna', admin: true, password: 'secret', authdata: 'YW5uYTpzZWNyZXQ=' })
      );

      const service = setUp();

      expect(service.currentUserValue).toEqual(new User(3, 'anna', true));
      expect(JSON.parse(localStorage.getItem('currentUser')!)).toEqual({ id: 3, username: 'anna', admin: true });
    });

    it('takes a stored entry it can not read for no login', () => {
      localStorage.setItem('currentUser', 'not json');
      expect(setUp().currentUserValue).toBeNull();

      TestBed.resetTestingModule();
      localStorage.setItem('currentUser', JSON.stringify({ username: 'anna' }));
      expect(setUp().currentUserValue).toBeNull();
    });

    it('logs out on the server and forgets the user right away', () => {
      localStorage.setItem('currentUser', JSON.stringify({ id: 3, username: 'anna' }));
      const service = setUp();

      service.logout();

      expect(service.currentUserValue).toBeNull();
      expect(localStorage.getItem('currentUser')).toBeNull();
      const request = http.expectOne(`${server}/api/v1/auth/logout`);
      expect(request.request.method).toBe('POST');
      request.flush(null);
    });

    it('is logged out in the client even when the server can not be reached', () => {
      localStorage.setItem('currentUser', JSON.stringify({ id: 3, username: 'anna' }));
      const service = setUp();

      service.logout();
      http.expectOne(`${server}/api/v1/auth/logout`).error(new ProgressEvent('error'));

      expect(service.currentUserValue).toBeNull();
    });

    it('changes the password without keeping it', () => {
      localStorage.setItem('currentUser', JSON.stringify({ id: 3, username: 'anna' }));
      const service = setUp();
      let done = false;

      service.changePassword('old', 'new').subscribe(() => (done = true));
      const request = http.expectOne(`${server}/api/v1/users/password`);
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({ currentPassword: 'old', newPassword: 'new' });
      request.flush(null);

      expect(done).toBe(true);
      expect(service.currentUserValue).toEqual(new User(3, 'anna'));
      expect(JSON.stringify(localStorage)).not.toContain('new');
    });
  });

  describe('authInterceptor', () => {
    function loggedIn(): { service: AuthenticationService; client: HttpClient } {
      localStorage.setItem('currentUser', JSON.stringify({ id: 3, username: 'anna' }));
      const service = setUp();
      return { service, client: TestBed.inject(HttpClient) };
    }

    it('sends the login cookie with requests to the server of the app', () => {
      const { client } = loggedIn();

      client.get(`${server}/api/v1/media/all`).subscribe();

      const request = http.expectOne(`${server}/api/v1/media/all`);
      expect(request.request.withCredentials).toBe(true);
      // the cookie is the login: the client sends no credentials itself
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({});
    });

    it('does not send it anywhere else', () => {
      const { client } = loggedIn();

      client.get('https://api.spotify.com/v1/me').subscribe();

      const request = http.expectOne('https://api.spotify.com/v1/me');
      expect(request.request.withCredentials).toBe(false);
      request.flush({});
    });

    it('forgets the user and opens the login page when the server does not know the login any more', () => {
      const { service, client } = loggedIn();
      let status = 0;

      client.get(`${server}/api/v1/media/all`).subscribe({ error: (error) => (status = error.status) });
      http.expectOne(`${server}/api/v1/media/all`).flush('', { status: 401, statusText: 'Unauthorized' });

      expect(service.currentUserValue).toBeNull();
      expect(localStorage.getItem('currentUser')).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/login']);
      // the caller still gets the error
      expect(status).toBe(401);
    });

    it('keeps the login on other errors', () => {
      const { service, client } = loggedIn();

      for (const status of [403, 404, 409, 500]) {
        client.get(`${server}/api/v1/media/${status}`).subscribe({ error: () => undefined });
        http.expectOne(`${server}/api/v1/media/${status}`).flush('', { status, statusText: 'Error' });
      }

      expect(service.currentUserValue).not.toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('does not send a user to the login page who is not logged in, e.g. with an invite that ran out', () => {
      setUp();
      const client = TestBed.inject(HttpClient);

      client.put(`${server}/api/v1/users/register?signature=old`, {}).subscribe({ error: () => undefined });
      http.expectOne(`${server}/api/v1/users/register?signature=old`).flush('', { status: 401, statusText: 'Unauthorized' });

      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
