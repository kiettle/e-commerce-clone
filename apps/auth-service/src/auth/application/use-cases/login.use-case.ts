import { UserRepositoryPort } from '../../domain/repositories/user.repository.port';
import { LoginCommand } from '../dto/login.command';
import { LoginResult } from '../dto/login.result';
import { InvalidCredentialsError } from '../errors/invalid-credentials.error';
import { PasswordHasherPort } from '../ports/password-hasher.port';
import { TokenServicePort } from '../ports/token.service.port';

export class LoginUseCase {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly tokenService: TokenServicePort,
  ) {}

  async execute(command: LoginCommand): Promise<LoginResult> {
    const user = await this.users.findByEmail(command.email);

    if (!user) {
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await this.passwordHasher.compare(
      command.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new InvalidCredentialsError();
    }

    const token = await this.tokenService.sign({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return { token };
  }
}
