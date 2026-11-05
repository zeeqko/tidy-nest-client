// Throwaway-database helpers for the e2e stack. Every DB operation goes
// through `assertE2eDatabaseName`, which refuses (throws) for any name that
// does not end in `_e2e`, so these helpers can never touch the developer's
// real `organizing_app` database.
import { execFileSync } from "node:child_process";

export const POSTGRES_CONTAINER = "organizing-app-postgres";
export const E2E_DATABASE = "organizing_app_e2e";

/** Throws unless `name` is a plain identifier ending in `_e2e`. */
export function assertE2eDatabaseName(name: string): string {
  if (!/^[a-z0-9_]+_e2e$/.test(name)) {
    throw new Error(
      `Refusing to touch database ${JSON.stringify(name)}: e2e helpers only operate on databases whose name ends in "_e2e".`,
    );
  }
  return name;
}

function psql(sql: string): string {
  return execFileSync(
    "docker",
    ["exec", POSTGRES_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

/** Drops (if left over from a crashed run) and recreates the e2e database. */
export function recreateE2eDatabase(name: string = E2E_DATABASE): void {
  const db = assertE2eDatabaseName(name);
  psql(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
  psql(`CREATE DATABASE "${db}"`);
}

export function dropE2eDatabase(name: string = E2E_DATABASE): void {
  const db = assertE2eDatabaseName(name);
  psql(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
}

/** Connection string for the backend under test (never the real database). */
export function e2eDatabaseUrl(name: string = E2E_DATABASE): string {
  const db = assertE2eDatabaseName(name);
  return `postgres://postgres:postgres@localhost:5432/${db}?sslmode=disable`;
}
