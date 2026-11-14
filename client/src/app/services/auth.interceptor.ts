import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthenticationService } from './authentication.service';

/**
 * Sends the login cookie with every request to the server of the app. The development client runs on another port
 * than the server, so its requests are cross-origin: the browser only adds cookies when asked to (withCredentials).
 * <p>
 * A 401 means the server does not know the login (any more), e.g. it ended or the password was changed in another
 * browser: the client forgets the user and shows the login page. The login and logout requests answer 401 themselves.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(environment.dbServer)) {
    return next(request);
  }
  const authenticationService = inject(AuthenticationService);
  const router = inject(Router);
  return next(request.clone({ withCredentials: true })).pipe(
    catchError((error: unknown) => {
      const loginEnded =
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !request.url.includes('/api/v1/auth/') &&
        !!authenticationService.currentUserValue;
      if (loginEnded) {
        authenticationService.forgetLogin();
        router.navigate(['/login']).catch(console.error);
      }
      return throwError(() => error);
    })
  );
};
