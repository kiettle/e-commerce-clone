const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('node:path');

const [, , address, method, rawRequest = '{}'] = process.argv;

if (!address || !method) {
  process.stderr.write('Usage: node scripts/call-product-grpc.cjs <address> <method> [json]\n');
  process.exit(2);
}

const definition = protoLoader.loadSync(
  path.join(process.cwd(), 'libs/proto/product.proto'),
  { keepCase: true, longs: String },
);
const productPackage = grpc.loadPackageDefinition(definition).product;
const client = new productPackage.ProductService(
  address,
  grpc.credentials.createInsecure(),
);
const request = toSnakeCase(JSON.parse(rawRequest));
const methodName = method[0].toLowerCase() + method.slice(1);

client[methodName](request, { deadline: new Date(Date.now() + 5000) }, (error, response) => {
  client.close();
  if (error) {
    process.stderr.write(`${error.details || error.message}\n`);
    process.exitCode = 1;
    return;
  }

  const normalized = toCamelCase(response);
  const output = method === 'ListFlashSales' ? normalized.flashSales : normalized;
  process.stdout.write(JSON.stringify(output));
});

function toSnakeCase(value) {
  if (Array.isArray(value)) return value.map(toSnakeCase);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      toSnakeCase(item),
    ]),
  );
}

function toCamelCase(value) {
  if (Array.isArray(value)) return value.map(toCamelCase);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase()),
      toCamelCase(item),
    ]),
  );
}
