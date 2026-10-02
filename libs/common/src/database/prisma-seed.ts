import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type CleanupFn = () => Promise<void> | void;
type SeedFn = () => Promise<void> | void;

export function loadEnvFiles(
  envFiles: string[] = ['.env.local', '.env'],
  rootDir = process.cwd(),
): void {
  for (const envFile of envFiles) {
    const filePath = resolve(rootDir, envFile);

    if (!existsSync(filePath)) {
      continue;
    }

    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      const equalsIndex = trimmedLine.indexOf('=');

      if (equalsIndex === -1) {
        continue;
      }

      const key = trimmedLine.slice(0, equalsIndex).trim();
      const rawValue = trimmedLine.slice(equalsIndex + 1).trim();
      const value = stripWrappingQuotes(rawValue);

      process.env[key] ??= value;
    }
  }
}

export async function runPrismaSeed(seed: SeedFn, cleanup?: CleanupFn): Promise<void> {
  try {
    await seed();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await cleanup?.();
  }
}

function stripWrappingQuotes(value: string): string {
  const startsAndEndsWithDoubleQuotes = value.startsWith('"') && value.endsWith('"');
  const startsAndEndsWithSingleQuotes = value.startsWith("'") && value.endsWith("'");

  if (startsAndEndsWithDoubleQuotes || startsAndEndsWithSingleQuotes) {
    return value.slice(1, -1);
  }

  return value;
}
