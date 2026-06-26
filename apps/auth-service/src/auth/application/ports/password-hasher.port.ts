export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

export interface PasswordHasherPort {
  compare(plainTextPassword: string, passwordHash: string): Promise<boolean>;
}
