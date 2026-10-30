import { status } from '@grpc/grpc-js';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

// Translate transport errors only. Domain decisions belong to the service.
export function grpcHttpError(error: unknown, serviceName: string): HttpException {
  if (error instanceof HttpException) return error;
  const failure = error as { code?: number; details?: string } | null;
  const body = publicDetails(failure?.details, `${serviceName} request failed.`);
  switch (failure?.code) {
    case status.INVALID_ARGUMENT:
      return new BadRequestException(body);
    case status.UNAUTHENTICATED:
      return new UnauthorizedException(body);
    case status.PERMISSION_DENIED:
      return new ForbiddenException(body);
    case status.NOT_FOUND:
      return new NotFoundException(body);
    case status.ALREADY_EXISTS:
    case status.FAILED_PRECONDITION:
      return new ConflictException(body);
    case status.UNAVAILABLE:
      return new ServiceUnavailableException(`${serviceName} unavailable.`);
    case status.DEADLINE_EXCEEDED:
      return new GatewayTimeoutException(`${serviceName} request timed out.`);
    case status.INTERNAL:
      return new InternalServerErrorException('Internal server error');
    default:
      return typeof failure?.code === 'number'
        ? new BadGatewayException(`${serviceName} request failed.`)
        : new InternalServerErrorException('Internal server error');
  }
}

function publicDetails(
  details: string | undefined,
  fallback: string,
): string | Record<string, string> {
  if (!details) return fallback;
  try {
    const body: unknown = JSON.parse(details);
    if (
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
    ) {
      return {
        message: body.message,
        ...('code' in body && typeof body.code === 'string' ? { code: body.code } : {}),
      };
    }
  } catch {
    /* Plain details are used by existing protobuf services. */
  }
  return details;
}
