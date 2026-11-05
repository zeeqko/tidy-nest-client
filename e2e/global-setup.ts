// Boots an isolated e2e stack and returns its teardown:
//   1. a throwaway Postgres database `organizing_app_e2e` (see support/db.ts),
//   2. a freshly built Go backend on :18080, started from a temp working
//      directory (so backend/.env is never loaded) with a minimal, explicit
//      environment (no R2, no Gemini, local uploads in the temp dir),
//   3. a second Vite dev server on :15173 whose /api and /uploads proxy goes
//      to :18080 (E2E_API_TARGET), with its own optimizer cache and without
//      the PWA plugin (see vite.e2e.config.ts).
// The developer's own servers (:8080 / :5173) and database are never touched.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dropE2eDatabase, e2eDatabaseUrl, recreateE2eDatabase } from "./support/db";
import { API_PORT, API_URL, APP_PORT, APP_URL } from "./support/stack";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, "..");
const backendDir = path.resolve(clientDir, "../backend");

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function waitFor(url: string, timeoutMs: number, proc: ChildProcess): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`process exited early with code ${proc.exitCode}`);
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastError = `status ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for ${url} (${lastError})`);
}

function signalGroup(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    // ESRCH: the whole group is already gone.
    return false;
  }
}

/**
 * Stops a detached process and its whole process group: SIGTERM, wait for
 * the leader to exit (at most `graceMs`), then always SIGKILL the group
 * best-effort, so children that outlive the leader or ignore SIGTERM (e.g.
 * Vite's esbuild service) are gone too. Never rejects.
 */
async function killGroup(proc: ChildProcess | undefined, graceMs = 5000): Promise<void> {
  if (!proc || proc.pid === undefined) return;
  const pid = proc.pid;
  const leaderRunning = proc.exitCode === null && proc.signalCode === null;
  if (signalGroup(pid, "SIGTERM") && leaderRunning) {
    await new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined = undefined;
      const done = () => {
        if (timer !== undefined) clearTimeout(timer);
        resolve();
      };
      proc.once("exit", done);
      timer = setTimeout(done, graceMs);
    });
    // Brief grace for the rest of the group to handle SIGTERM too.
    await new Promise((r) => setTimeout(r, 300));
  }
  signalGroup(pid, "SIGKILL");
}

function printLog(label: string, file: string) {
  try {
    console.error(`\n----- ${label} log (${file}) -----\n${fs.readFileSync(file, "utf8")}\n----- end ${label} log -----`);
  } catch {
    console.error(`(no ${label} log at ${file})`);
  }
}

export default async function globalSetup() {
  for (const port of [API_PORT, APP_PORT]) {
    if (await portInUse(port)) {
      throw new Error(
        `Port ${port} is already in use. The e2e stack needs it free; it will not reuse or kill whatever is listening there.`,
      );
    }
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "organizing-app-e2e-"));
  const uploadsDir = path.join(tmpDir, "uploads");
  fs.mkdirSync(uploadsDir);
  const backendLog = path.join(tmpDir, "backend.log");
  const viteLog = path.join(tmpDir, "vite.log");

  let backend: ChildProcess | undefined;
  let vite: ChildProcess | undefined;
  let tornDown = false;

  const teardown = async () => {
    if (tornDown) return;
    tornDown = true;
    try {
      // Each kill is isolated so one failure can't skip the other.
      await Promise.all(
        [vite, backend].map((proc) =>
          killGroup(proc).catch((err) => console.error("e2e teardown: failed to stop a server", err)),
        ),
      );
    } finally {
      try {
        dropE2eDatabase(); // goes through the _e2e name guard
      } catch (err) {
        console.error("e2e teardown: failed to drop the e2e database", err);
      }
      if (process.env.E2E_KEEP_TMP) {
        console.log(`e2e: kept temp dir ${tmpDir}`);
      } else {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (err) {
          console.error(`e2e teardown: failed to remove ${tmpDir}`, err);
        }
      }
    }
  };
  // Last-resort cleanup if the runner dies without calling teardown.
  const emergencyKill = () => {
    // Group-wide even if the leader already exited (children may linger).
    for (const proc of [vite, backend]) {
      if (proc?.pid !== undefined) signalGroup(proc.pid, "SIGKILL");
    }
  };
  process.once("exit", emergencyKill);

  try {
    recreateE2eDatabase();

    const binary = path.join(tmpDir, "server");
    execFileSync("go", ["build", "-o", binary, "./cmd/server"], { cwd: backendDir, stdio: "inherit" });

    // Clean environment: only PATH/HOME plus the explicit settings below, so
    // nothing from the developer's shell (or backend/.env, which is resolved
    // relative to the cwd) can leak in.
    const backendEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: process.env.HOME ?? tmpDir,
      PORT: String(API_PORT),
      DATABASE_URL: e2eDatabaseUrl(),
      R2_ACCOUNT_ID: "",
      R2_BUCKET: "",
      R2_ACCESS_KEY_ID: "",
      R2_SECRET_ACCESS_KEY: "",
      GEMINI_API_KEY: "",
      UPLOAD_DIR: uploadsDir,
    };
    const backendOut = fs.openSync(backendLog, "a");
    backend = spawn(binary, [], {
      cwd: tmpDir,
      env: backendEnv,
      detached: true,
      stdio: ["ignore", backendOut, backendOut],
    });
    try {
      await waitFor(`${API_URL}/healthz`, 60_000, backend);
    } catch (err) {
      printLog("backend", backendLog);
      throw new Error(`e2e backend failed to start: ${(err as Error).message}`);
    }
    const startup = fs.readFileSync(backendLog, "utf8");
    if (!startup.includes(`item photos stored in local directory ${uploadsDir}`)) {
      printLog("backend", backendLog);
      throw new Error("e2e backend is not using local photo storage");
    }

    const viteOut = fs.openSync(viteLog, "a");
    vite = spawn(
      process.execPath,
      [
        path.join(clientDir, "node_modules/vite/bin/vite.js"),
        "--config",
        path.join(here, "vite.e2e.config.ts"),
        "--port",
        String(APP_PORT),
        "--strictPort",
        "--host",
        "localhost",
      ],
      {
        cwd: clientDir,
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          HOME: process.env.HOME ?? tmpDir,
          TMPDIR: process.env.TMPDIR ?? os.tmpdir(),
          E2E_API_TARGET: API_URL,
        },
        detached: true,
        stdio: ["ignore", viteOut, viteOut],
      },
    );
    try {
      await waitFor(`${APP_URL}/`, 60_000, vite);
      // Warm the module graph so the first test doesn't pay for the cold
      // dependency optimisation.
      await fetch(`${APP_URL}/src/main.tsx`);
    } catch (err) {
      printLog("vite", viteLog);
      throw new Error(`e2e vite server failed to start: ${(err as Error).message}`);
    }

    // Prove the proxy reaches the e2e backend (a harmless unauthenticated GET
    // tagged with a nonce, then looked up in the e2e backend's request log).
    const nonce = `e2e-probe-${Date.now()}`;
    await fetch(`${APP_URL}/api/auth/me?${nonce}`);
    await new Promise((r) => setTimeout(r, 200));
    if (!fs.readFileSync(backendLog, "utf8").includes(nonce)) {
      printLog("vite", viteLog);
      throw new Error("Vite proxy did not reach the e2e backend on :18080; refusing to run tests.");
    }
  } catch (err) {
    await teardown();
    throw err;
  }

  return teardown;
}
