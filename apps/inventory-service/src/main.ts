import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? process.env.INVENTORY_SERVICE_PORT ?? 4003);
  const grpcUrl =
    process.env.INVENTORY_GRPC_URL ??
    `0.0.0.0:${process.env.INVENTORY_GRPC_PORT ?? 9003}`;

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'inventory',
      protoPath: join(process.cwd(), 'libs/proto/inventory.proto'),
      url: grpcUrl,
      loader: {
        keepCase: true,
        longs: String,
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(port);
}

void bootstrap();
