package de.crow08.portalsync.authentication;

import de.crow08.portalsync.model.users.AuthenticatedUser;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Logs a request in by the login cookie of the browser (see {@link LoginCookie}). A request without a valid cookie
 * just stays anonymous: whether that is enough is decided by the rules of the security configuration.
 * <p>
 * Not a Spring bean on purpose: as a bean Spring Boot would also register it as a servlet filter outside the security
 * filter chain.
 */
public class LoginTokenFilter extends OncePerRequestFilter {

  private final LoginTokenService tokens;
  private final LoginCookie cookie;

  public LoginTokenFilter(LoginTokenService tokens, LoginCookie cookie) {
    this.tokens = tokens;
    this.cookie = cookie;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    Authentication existing = SecurityContextHolder.getContext().getAuthentication();
    if (existing == null || !existing.isAuthenticated() || existing instanceof AnonymousAuthenticationToken) {
      String token = cookie.read(request);
      if (token != null) {
        tokens.find(token).ifPresent(login -> {
          // the same principal as after a login with the password: the controllers read the user from it
          AuthenticatedUser principal = new AuthenticatedUser(login.user());
          UsernamePasswordAuthenticationToken authentication =
              UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities());
          authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
          SecurityContext context = SecurityContextHolder.createEmptyContext();
          context.setAuthentication(authentication);
          SecurityContextHolder.setContext(context);
          if (login.renewed()) {
            cookie.set(request, response, token);
          }
        });
      }
    }
    chain.doFilter(request, response);
  }
}
