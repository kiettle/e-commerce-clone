import { ProductSkuStatus } from '../../domain/enums/product-sku-status.enum';
import { ProtobufProductEventSerializer } from './protobuf-product-event-serializer';

describe('ProtobufProductEventSerializer', () => {
  it('round-trips a ProductCreated event', () => {
    const serializer = new ProtobufProductEventSerializer();

    const buffer = serializer.encodeProductCreated({
      productId: 10n,
      name: 'Running Shoes',
      skus: [
        {
          productSkuId: 100n,
          skuCode: 'SHOE-BLACK-42',
          status: ProductSkuStatus.Available,
          quantity: 100,
        },
      ],
    });

    const decoded = serializer.decodeProductCreated(buffer);

    expect(decoded.eventId).toEqual(expect.any(String));
    expect(decoded.eventType).toBe('PRODUCT_CREATED');
    expect(decoded.productId).toBe('10');
    expect(decoded.name).toBe('Running Shoes');
    expect(decoded.skus).toEqual([
      {
        productSkuId: '100',
        skuCode: 'SHOE-BLACK-42',
        status: 'AVAILABLE',
        quantity: '100',
      },
    ]);
  });
});
