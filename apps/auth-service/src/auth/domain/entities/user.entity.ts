export interface UserEntityProps {
  id: bigint;
  email: string;
  passwordHash: string;
  role: string;
}

export class UserEntity {
  readonly id: bigint;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: string;

  constructor(props: UserEntityProps) {
    this.id = props.id;
    this.email = props.email;
    this.passwordHash = props.passwordHash;
    this.role = props.role;
  }
}
