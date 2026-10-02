import { describe, expect, it } from 'vitest';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { FlashSalesGatewayController } from './flash-sales-gateway.controller';

describe('FlashSalesGatewayController role metadata', () => {
  it.each(['create', 'update', 'cancel', 'schedule'] as const)(
    'requires ADMIN for %s',
    (method) => {
      expect(Reflect.getMetadata(ROLES_KEY, FlashSalesGatewayController.prototype[method])).toEqual(
        [UserRole.Admin],
      );
    },
  );

  it.each(['list', 'get'] as const)('does not restrict %s to administrators', (method) => {
    expect(
      Reflect.getMetadata(ROLES_KEY, FlashSalesGatewayController.prototype[method]),
    ).toBeUndefined();
  });
});
