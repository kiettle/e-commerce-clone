import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { grpcHttpError } from '@app/common';

interface HttpResponse {
  status(statusCode: number): {
    json(body: Record<string, unknown>): void;
  };
}

@Catch()
export class GrpcToHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const httpException = grpcHttpError(exception, 'Downstream service');
    const statusCode = httpException.getStatus();
    const exceptionResponse = httpException.getResponse();
    const body: Record<string, unknown> =
      typeof exceptionResponse === 'string'
        ? { message: exceptionResponse }
        : { ...exceptionResponse };

    response.status(statusCode).json({
      ...body,
      statusCode,
      message: body.message ?? httpException.message,
      error: HttpStatus[statusCode],
    });
  }
}
