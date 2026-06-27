export interface AuthenticatedUser {
  userId: number;
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  originalUrl?: string;
  url?: string;
  user?: AuthenticatedUser;
}
