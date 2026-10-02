import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { AuthenticatedRequest } from '../types/authenticated-user';

interface HttpResponse {
  statusCode?: number;
}

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<HttpResponse>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.logRequest(request, response.statusCode ?? 200, startedAt);
      }),
      catchError((error: unknown) => {
        const statusCode =
          error instanceof HttpException
            ? error.getStatus()
            : response.statusCode && response.statusCode >= 400
              ? response.statusCode
              : 500;

        this.logRequest(request, statusCode, startedAt);

        return throwError(() => error);
      }),
    );
  }

  private logRequest(
    request: AuthenticatedRequest,
    statusCode: number,
    startedAt: number,
  ): void {
    const durationMs = Date.now() - startedAt;
    const method = request.method ?? 'UNKNOWN';
    const url = request.originalUrl ?? request.url ?? 'unknown-url';

    this.logger.log(`${method} ${url} ${statusCode} ${durationMs}ms`);
  }
}
