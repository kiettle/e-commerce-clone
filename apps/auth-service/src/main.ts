import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? process.env.AUTH_SERVICE_PORT ?? 4005);
  const grpcUrl = process.env.AUTH_GRPC_URL ?? `0.0.0.0:${process.env.AUTH_GRPC_PORT ?? 9005}`;

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'auth',
      protoPath: join(process.cwd(), 'libs/proto/auth.proto'),
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
