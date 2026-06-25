import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? process.env.INVENTORY_SERVICE_PORT ?? 4003);

  await app.listen(port);
}

void bootstrap();
