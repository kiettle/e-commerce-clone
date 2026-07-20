import type {
  AuthenticatedUser,
  Cart,
  Category,
  CheckoutResult,
  CreateProductInput,
  HealthResponse,
  Product,
} from '@/types/api';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends RequestInit {
  token?: string;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers, ...init } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? ((await response.json()) as unknown)
    : await response.text();

  if (!response.ok) {
    throw new ApiError(getErrorMessage(body, response.status), response.status);
  }

  return body as T;
}

function getErrorMessage(body: unknown, status: number) {
  if (typeof body === 'string' && body.trim()) return body;

  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join(' · ');
    if (typeof message === 'string') return message;
  }

  return `Request failed with status ${status}.`;
}

export const api = {
  health: () => request<HealthResponse>('/health'),

  login: (email: string, password: string) =>
    request<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  validate: (token: string) =>
    request<AuthenticatedUser>('/api/auth/validate', { token }),

  getProducts: (
    token: string,
    query?: { name?: string; categoryId?: number },
  ) => {
    const params = new URLSearchParams();
    if (query?.name) params.set('name', query.name);
    if (query?.categoryId) params.set('categoryId', String(query.categoryId));
    const suffix = params.size ? `?${params.toString()}` : '';
    return request<Product[]>(`/api/products${suffix}`, { token });
  },

  getCategories: (token: string) =>
    request<Category[]>('/api/categories', { token }),

  createProduct: (token: string, input: CreateProductInput) =>
    request<Product>('/api/products', {
      method: 'POST',
      token,
      body: JSON.stringify(input),
    }),

  getCart: (token: string) => request<Cart>('/api/carts/me', { token }),

  addCartItem: (token: string, productSkuId: number, quantity: number) =>
    request<Cart>('/api/cart-items', {
      method: 'POST',
      token,
      body: JSON.stringify({ productSkuId, quantity }),
    }),

  updateCartItem: (token: string, cartItemId: number, quantity: number) =>
    request<Cart>(`/api/cart-items/${cartItemId}`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ quantity }),
    }),

  deleteCartItem: (token: string, cartItemId: number) =>
    request<Cart>(`/api/cart-items/${cartItemId}`, {
      method: 'DELETE',
      token,
    }),

  checkout: (token: string, cartId: number) =>
    request<CheckoutResult>(`/api/carts/${cartId}/checkout`, {
      method: 'POST',
      token,
    }),
};
