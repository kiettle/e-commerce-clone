import { UnauthorizedException } from '@nestjs/common';

export function parseUserIdHeader(userIdHeader: string | undefined): bigint {
  const userId = Number(userIdHeader);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new UnauthorizedException('Missing or invalid x-user-id header.');
  }

  return BigInt(userId);
}
