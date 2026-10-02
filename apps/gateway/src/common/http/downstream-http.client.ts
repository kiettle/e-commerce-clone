import { BadGatewayException, HttpException, Injectable } from '@nestjs/common';

type DownstreamHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface DownstreamHttpRequest {
  serviceName: string;
  baseUrl: string;
  path: string;
  method: DownstreamHttpMethod;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

@Injectable()
export class DownstreamHttpClient {
  async request<T>(request: DownstreamHttpRequest): Promise<T> {
    let response: Response;

    try {
      response = await fetch(buildUrl(request), buildRequestInit(request));
    } catch {
      throw new BadGatewayException(`${request.serviceName} request failed.`);
    }

    const responseBody = await parseResponseBody(response);

    if (!response.ok) {
      throw new HttpException(
        normalizeErrorBody(responseBody, request.serviceName),
        response.status,
      );
    }

    return responseBody as T;
  }
}

function buildRequestInit(request: DownstreamHttpRequest): RequestInit {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...request.headers,
  };

  const init: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(request.body);
  }

  return init;
}

function buildUrl(request: DownstreamHttpRequest): string {
  const url = new URL(request.path, normalizeBaseUrl(request.baseUrl));

  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function normalizeErrorBody(
  responseBody: unknown,
  serviceName: string,
): string | Record<string, unknown> {
  if (typeof responseBody === 'string') {
    return { message: responseBody };
  }

  if (isRecord(responseBody)) {
    return responseBody;
  }

  return { message: `${serviceName} returned an error.` };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

