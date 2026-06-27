import {
  ArgumentsHost,
  BadGatewayException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { status as GrpcStatus } from '@grpc/grpc-js';

interface HttpResponse {
  status(statusCode: number): {
    json(body: Record<string, unknown>): void;
  };
}

interface GrpcErrorLike {
  code?: number;
  details?: string;
  message?: string;
}

@Catch()
export class GrpcToHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const httpException = toHttpException(exception);
    const statusCode = httpException.getStatus();
    const exceptionResponse = httpException.getResponse();
    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as { message?: unknown }).message;

    response.status(statusCode).json({
      statusCode,
      message: message ?? httpException.message,
      error: HttpStatus[statusCode],
    });
  }
}

function toHttpException(exception: unknown): HttpException {
  if (exception instanceof HttpException) {
    return exception;
  }

  const grpcError = exception as GrpcErrorLike;

  if (grpcError.code === GrpcStatus.UNAUTHENTICATED) {
    return new UnauthorizedException(grpcError.details ?? grpcError.message);
  }

  if (grpcError.code === GrpcStatus.UNAVAILABLE) {
    return new ServiceUnavailableException('Downstream service unavailable.');
  }

  if (grpcError.code !== undefined) {
    return new BadGatewayException('Downstream service request failed.');
  }

  return new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
}
