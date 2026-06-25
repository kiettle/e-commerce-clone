export interface HealthResponse {
  service: string;
  status: 'ok';
  timestamp: string;
}

export function createHealthResponse(service: string): HealthResponse {
  return {
    service,
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
}
