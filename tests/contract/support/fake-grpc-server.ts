import {
  loadPackageDefinition,
  Server,
  ServerCredentials,
  ServiceClientConstructor,
  UntypedServiceImplementation,
} from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';

export interface FakeGrpcServer {
  url: string;
  close(): Promise<void>;
}

export async function startFakeGrpcServer(options: {
  protoPath: string;
  packageName: string;
  serviceName: string;
  implementation: UntypedServiceImplementation;
}): Promise<FakeGrpcServer> {
  const definition = loadSync(options.protoPath, {
    keepCase: true,
    longs: String,
    defaults: true,
  });
  const loaded = loadPackageDefinition(definition) as Record<string, unknown>;
  const packageDefinition = loaded[options.packageName] as Record<string, unknown> | undefined;
  const service = packageDefinition?.[options.serviceName] as ServiceClientConstructor | undefined;

  if (!service?.service) {
    throw new Error(`gRPC service ${options.packageName}.${options.serviceName} was not found.`);
  }

  const server = new Server();
  server.addService(service.service, options.implementation);
  const port = await new Promise<number>((resolve, reject) => {
    server.bindAsync('127.0.0.1:0', ServerCredentials.createInsecure(), (error, boundPort) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(boundPort);
    });
  });

  return {
    url: `127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.tryShutdown((error) => {
          if (error) {
            server.forceShutdown();
          }
          resolve();
        });
      }),
  };
}
