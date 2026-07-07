import { Injectable } from '@nestjs/common';
import {
  createHealthResponse,
  createHelloResponse,
  HealthResponse,
  HelloResponse,
} from '@app/common';

const SERVICE_NAME = 'order-service';

@Injectable()
export class HealthService {
  health(): HealthResponse {
    return createHealthResponse(SERVICE_NAME);
  }

  hello(): HelloResponse {
    return createHelloResponse(SERVICE_NAME);
  }
}
