package de.crow08.portalsync.model.users;

import com.fasterxml.jackson.annotation.JsonProperty;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;

@Entity
public class User {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private long id;

  @Column(nullable = false, unique = true)
  private String username;

  // write only: accepted on registration, but never included in any response
  @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
  @Column(nullable = false)
  private String password;

  // read only: can only be set in the database, never through the API
  @JsonProperty(access = JsonProperty.Access.READ_ONLY)
  @Column(nullable = false, columnDefinition = "boolean default false")
  private boolean admin;

  @Deprecated
  public User() {
  }

  public User(String username, String password) {
    this.username = username;
    this.password = password;
  }

  public User(long id, String username, boolean admin) {
    this.id = id;
    this.username = username;
    this.admin = admin;
  }

  public long getId() {
    return id;
  }

  public void setId(long id) {
    this.id = id;
  }

  public String getUsername() {
    return username;
  }

  public void setUsername(String username) {
    this.username = username;
  }

  public String getPassword() {
    return password;
  }

  public void setPassword(String string) {
    this.password = string;
  }

  public boolean isAdmin() {
    return admin;
  }

  public void setAdmin(boolean admin) {
    this.admin = admin;
  }
}
