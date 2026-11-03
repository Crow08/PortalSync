package de.crow08.portalsync.authentication;

import de.crow08.portalsync.model.users.AuthenticatedUser;
import de.crow08.portalsync.model.users.User;
import de.crow08.portalsync.model.users.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class AuthenticatedUserService implements UserDetailsService {

  private final UserRepository userRepository;

  @Autowired
  public AuthenticatedUserService(UserRepository userRepository) {
    this.userRepository = userRepository;
  }

  @Override
  public UserDetails loadUserByUsername(String username) {
    User user = userRepository.findByUsername(username);
    if (user == null) {
      throw new UsernameNotFoundException("The user " + username + " does not exist");
    }
    return new AuthenticatedUser(user);
  }
}
