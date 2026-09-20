import { UserRole } from '../enums/user-role.enum';

export interface AuthenticatedUser {
  userId: number;
  role: UserRole;
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  originalUrl?: string;
  url?: string;
  user?: AuthenticatedUser;
}
