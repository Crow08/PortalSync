export class User {
  id: number;
  username: string;
  password: string;
  authdata?: string;
  admin = false;

  constructor(id: number, username: string, password: string, authdata: string) {
    this.id = id;
    this.username = username;
    this.password = password;
    this.authdata = authdata;
  }
}
