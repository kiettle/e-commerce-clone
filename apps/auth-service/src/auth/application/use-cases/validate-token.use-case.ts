import { ValidateTokenCommand } from '../dto/validate-token.command';
import { ValidateTokenResult } from '../dto/validate-token.result';
import { InvalidTokenError } from '../errors/invalid-token.error';
import { TokenServicePort } from '../ports/token.service.port';

export class ValidateTokenUseCase {
  constructor(private readonly tokenService: TokenServicePort) {}

  async execute(command: ValidateTokenCommand): Promise<ValidateTokenResult> {
    try {
      return await this.tokenService.verify(command.token);
    } catch {
      throw new InvalidTokenError();
    }
  }
}
