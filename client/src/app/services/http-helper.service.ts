import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { plainToInstance } from 'class-transformer';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { ClassConstructor } from 'class-transformer/types/interfaces';
import { filter, firstValueFrom, map, tap } from 'rxjs';

/** The part of a page of the REST API the client uses. */
interface RestPage {
  content: unknown[];
  totalElements: number;
}

export class Page<T> {
  content: T[];
  numberOfElements: number;

  constructor(content: T[], totalElements: number) {
    this.content = content;
    this.numberOfElements = totalElements;
  }
}

/**
 * Requests to the REST API of the server as promises. The login is not its business: the browser sends the login
 * cookie with every request (see authInterceptor).
 */
@Injectable({
  providedIn: 'root',
})
export class HttpHelperService {
  constructor(private http: HttpClient) {}

  private url(path: string): string {
    return `${environment.dbServer}${path}`;
  }

  public async get<T>(path: string, clazz: ClassConstructor<T>): Promise<T> {
    return plainToInstance(clazz, await firstValueFrom(this.http.get(this.url(path))));
  }

  public getPlain(path: string): Promise<string> {
    return firstValueFrom(this.http.get(this.url(path), { responseType: 'text' }));
  }

  public async getArray<T>(path: string, clazz: ClassConstructor<T>): Promise<T[]> {
    const values = await firstValueFrom(this.http.get<unknown[]>(this.url(path)));
    return values.map((rawObject) => plainToInstance(clazz, rawObject));
  }

  async getPage<T>(path: string, clazz: ClassConstructor<T>): Promise<Page<T>> {
    const restPage = await firstValueFrom(this.http.get<RestPage>(this.url(path)));
    return new Page<T>(
      restPage.content.map((rawObject) => plainToInstance(clazz, rawObject)),
      restPage.totalElements
    );
  }

  public post<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.post<T>(this.url(path), body));
  }

  /**
   * A post that tells how much of the body is sent, for uploads.
   *
   * @param onProgress called with the bytes sent so far and the size of the body (0 if the browser does not know it)
   */
  public postWithProgress<T>(path: string, body: unknown, onProgress: (loaded: number, total: number) => void): Promise<T> {
    return firstValueFrom(
      this.http.post<T>(this.url(path), body, { observe: 'events', reportProgress: true }).pipe(
        tap((event) => {
          if (event.type === HttpEventType.UploadProgress) {
            onProgress(event.loaded, event.total ?? 0);
          }
        }),
        filter((event) => event.type === HttpEventType.Response),
        map((event) => event.body as T)
      )
    );
  }

  public put<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.put<T>(this.url(path), body));
  }

  public async delete(path: string): Promise<void> {
    await firstValueFrom(this.http.delete(this.url(path)));
  }

  public putPlain(path: string, body: unknown): Promise<string> {
    return firstValueFrom(this.http.put(this.url(path), body, { responseType: 'text' }));
  }
}
