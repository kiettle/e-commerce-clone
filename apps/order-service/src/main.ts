import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? process.env.ORDER_SERVICE_PORT ?? 4004);
  const grpcUrl =
    process.env.ORDER_GRPC_URL ??
    `0.0.0.0:${process.env.ORDER_GRPC_PORT ?? 9004}`;

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'order',
      protoPath: join(process.cwd(), 'libs/proto/order.proto'),
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
