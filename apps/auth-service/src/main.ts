import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? process.env.AUTH_SERVICE_PORT ?? 4005);
  const grpcUrl = process.env.AUTH_GRPC_URL ?? `0.0.0.0:${process.env.AUTH_GRPC_PORT ?? 9005}`;

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Auth Service API')
    .setDescription('The auth service API description')
    .setVersion('1.0')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'auth',
      protoPath: join(process.cwd(), 'libs/proto/auth.proto'),
      url: grpcUrl,
      loader: {
        keepCase: true,
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(port);
}

void bootstrap();
