import { describe, expect, it } from 'vitest';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { ProductsGatewayController } from './products-gateway.controller';

describe('ProductsGatewayController role metadata', () => {
  it.each(['createProduct', 'updateProduct', 'deleteProduct'] as const)(
    'requires ADMIN for %s',
    (method) => {
      expect(Reflect.getMetadata(ROLES_KEY, ProductsGatewayController.prototype[method])).toEqual([
        UserRole.Admin,
      ]);
    },
  );

  it('does not restrict product reads to administrators', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, ProductsGatewayController.prototype.searchProducts),
    ).toBeUndefined();
  });
});
