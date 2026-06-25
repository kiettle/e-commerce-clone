import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? process.env.PRODUCT_SERVICE_PORT ?? 4001);

  await app.listen(port);
}

void bootstrap();
