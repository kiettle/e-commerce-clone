// Test-only caller for the legacy outbox workflow; production callers use CartGatewayClient.
const grpc = require('@grpc/grpc-js');
const loader = require('@grpc/proto-loader');
const path = require('node:path');
const [, , address, method, userId, resourceId = '', rawBody = '{}', key = ''] = process.argv;
if (!address || !method || !userId) throw new Error('Expected address, RPC method, user ID, resource ID, JSON body, and key.');
const definition = loader.loadSync(path.join(process.cwd(), 'libs/proto/cart.proto'), {
  keepCase: true, longs: String, defaults: true, oneofs: true,
});
const client = new (grpc.loadPackageDefinition(definition).cart.CartService)(address, grpc.credentials.createInsecure());
const body = JSON.parse(rawBody || '{}');
const request = { user_id: userId };
if (method === 'AddCartItem') Object.assign(request, { product_sku_id: String(body.productSkuId), quantity: body.quantity });
if (method === 'CheckoutCart') Object.assign(request, { cart_id: resourceId, idempotency_key: key });
if (method === 'GetCheckoutStatus') request.checkout_id = resourceId;
if (method === 'UpdateCartItem' || method === 'DeleteCartItem') request.cart_item_id = resourceId;
if (method === 'UpdateCartItem') request.quantity = body.quantity;
client[method](request, { deadline: new Date(Date.now() + 30000) }, (error, response) => {
  client.close();
  if (error) {
    let message;
    try { message = JSON.parse(error.details); } catch { message = { message: error.details }; }
    process.stdout.write(JSON.stringify({ grpcCode: error.code, body: message }));
    return;
  }
  const result = response.completed
    ? { ...response.completed, status: 'COMPLETED' }
    : response.pending ? { ...response.pending, status: 'RECONCILIATION_REQUIRED' } : response;
  process.stdout.write(JSON.stringify({ grpcCode: grpc.status.OK, body: camelCase(result) }));
});
function camelCase(value) {
  if (Array.isArray(value)) return value.map(camelCase);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), camelCase(item),
  ]));
}
