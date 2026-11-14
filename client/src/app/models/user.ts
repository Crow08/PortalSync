/**
 * A user as the client knows it. The client never keeps a password: the login of the browser is a cookie that the
 * scripts of the page can not read (see AuthenticationService).
 */
export class User {
  id: number;
  username: string;
  admin: boolean;

  constructor(id: number, username: string, admin = false) {
    this.id = id;
    this.username = username;
    this.admin = admin;
  }
}
