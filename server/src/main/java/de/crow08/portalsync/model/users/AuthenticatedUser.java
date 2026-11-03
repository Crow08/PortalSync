package de.crow08.portalsync.model.users;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;

public class AuthenticatedUser extends User implements UserDetails {
  public AuthenticatedUser(User user) {
    super(user.getUsername(), user.getPassword());
    super.setId(user.getId());
    // the admin flag decides about the rights of the user: without it nobody would ever be an admin
    super.setAdmin(user.isAdmin());
  }

  @Override
  public Collection<? extends GrantedAuthority> getAuthorities() {
    return isAdmin() ? AuthorityUtils.createAuthorityList("ROLE_USER", "ROLE_ADMIN")
        : AuthorityUtils.createAuthorityList("ROLE_USER");
  }

  @Override
  public boolean isAccountNonExpired() {
    return true;
  }

  @Override
  public boolean isAccountNonLocked() {
    return true;
  }

  @Override
  public boolean isCredentialsNonExpired() {
    return true;
  }

  @Override
  public boolean isEnabled() {
    return true;
  }
}
