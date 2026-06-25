export interface HelloResponse {
  service: string;
  message: string;
}

export function createHelloResponse(service: string): HelloResponse {
  return {
    service,
    message: `Hello from ${service}`,
  };
}
