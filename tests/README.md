# Test lanes

- Unit tests stay beside production code as `*.spec.ts`. They use direct construction and no Docker, database, broker, or network.
- Contract tests use `*.contract.spec.ts` beside a transport adapter or under `tests/contract/`. They verify protobuf field numbers and boundary mappings without infrastructure by default.
- Integration tests use `*.integration.spec.ts` beside an adapter or under `tests/integration/`. The integration runner provisions disposable infrastructure and runs files serially.
- End-to-end tests use `*.e2e.spec.ts` under `tests/e2e/` and exercise the complete application workflow.
- Shared lane helpers belong in a lane's `support/` directory and must not use a test-file suffix.
- Load tests belong under `tests/load/` and are not discovered by Vitest.

Run the lanes with `npm run test:unit`, `npm run test:contract`, `npm run test:integration`, and `npm run test:e2e`.
