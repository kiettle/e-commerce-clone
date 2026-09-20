import { describe, expect, it } from 'vitest';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { FlashSalesGatewayController } from './flash-sales-gateway.controller';

describe('FlashSalesGatewayController role metadata', () => {
  it('requires ADMIN for all flash-sale endpoints', () => {
    expect(Reflect.getMetadata(ROLES_KEY, FlashSalesGatewayController)).toEqual([UserRole.Admin]);
  });
});
