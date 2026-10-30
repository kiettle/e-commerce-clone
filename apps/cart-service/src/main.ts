import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? process.env.CART_SERVICE_PORT ?? 4002);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'cart',
      protoPath: join(process.cwd(), 'libs/proto/cart.proto'),
      url: process.env.CART_GRPC_URL ?? `0.0.0.0:${process.env.CART_GRPC_PORT ?? 9002}`,
      loader: { keepCase: true, longs: String, defaults: true, oneofs: true },
    },
  });
  await app.startAllMicroservices();
  await app.listen(port);
}

void bootstrap();
