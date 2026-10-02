export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');

export interface SignTokenPayload {
  userId: bigint;
  email: string;
  role: string;
}

export interface VerifiedTokenPayload {
  userId: bigint;
  email: string;
  role: string;
}

export interface TokenServicePort {
  sign(payload: SignTokenPayload): Promise<string>;
  verify(token: string): Promise<VerifiedTokenPayload>;
}
