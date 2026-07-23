import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const distRoot = path.join(repoRoot, "dist-electron");
const productName = "Skill Manager";
const artifactOnly = process.argv.includes("--artifact-only");
const launchMs = Number.parseInt(process.env.SKILL_MANAGER_PACKAGED_SMOKE_MS ?? "10000", 10);

if (!Number.isFinite(launchMs) || launchMs < 1000) {
  throw new Error("SKILL_MANAGER_PACKAGED_SMOKE_MS must be at least 1000");
}

const executablePath = process.env.SKILL_MANAGER_PACKAGED_EXECUTABLE
  ? path.resolve(process.env.SKILL_MANAGER_PACKAGED_EXECUTABLE)
  : await findPackagedExecutable();

if (!fs.existsSync(executablePath)) {
  throw new Error(`Packaged executable not found: ${executablePath}`);
}

if (artifactOnly) {
  await verifyExecutableArtifact(executablePath);
  console.log(`Packaged executable artifact probe passed: ${executablePath}`);
  process.exit(0);
}

const fixtureHome = await fs.promises.mkdtemp(path.join(os.tmpdir(), "skill-manager-packaged-home-"));
const fixtureData = await fs.promises.mkdtemp(path.join(os.tmpdir(), "skill-manager-packaged-data-"));
const smokeReportPath = path.join(fixtureData, "smoke-report.json");
const expectedUserData = expectedUserDataPath(fixtureHome, fixtureData);
const output = createOutputBuffer();
let exited = false;
let exitCode = null;
let exitSignal = null;

const child = spawn(executablePath, ["--no-sandbox", "--disable-gpu"], {
  cwd: path.dirname(executablePath),
  detached: process.platform !== "win32",
  env: {
    ...process.env,
    HOME: fixtureHome,
    USERPROFILE: fixtureHome,
    XDG_CONFIG_HOME: path.join(fixtureData, "xdg-config"),
    XDG_CACHE_HOME: path.join(fixtureData, "xdg-cache"),
    APPDATA: path.join(fixtureData, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(fixtureData, "AppData", "Local"),
    SKILL_MANAGER_SMOKE: "1",
    SKILL_MANAGER_SMOKE_REPORT: smokeReportPath,
    SKILL_MANAGER_SMOKE_USER_DATA: expectedUserData
  },
  stdio: ["ignore", "pipe", "pipe"]
});

child.stdout?.on("data", (chunk) => output.add(chunk));
child.stderr?.on("data", (chunk) => output.add(chunk));

child.on("exit", (code, signal) => {
  exited = true;
  exitCode = code;
  exitSignal = signal;
});

try {
  await waitForSpawn(child);
  await delay(launchMs);
  if (exited) {
    throw new Error(
      `Packaged app exited during launch probe with code ${exitCode ?? "null"} and signal ${exitSignal ?? "null"}.\n${output.text()}`
    );
  }
  const observedUserData = await readSmokeUserData(smokeReportPath);
  if (!observedUserData || comparablePath(observedUserData) !== comparablePath(expectedUserData)) {
    throw new Error(`Packaged app userData mismatch; expected ${expectedUserData}, got ${observedUserData ?? "no marker"}.\n${output.text()}`);
  }
  console.log(`Packaged app launch probe passed: ${executablePath}`);
} finally {
  await terminateProcessTree(child);
  await fs.promises.rm(fixtureHome, { recursive: true, force: true });
  await fs.promises.rm(fixtureData, { recursive: true, force: true });
}

async function findPackagedExecutable() {
  if (!fs.existsSync(distRoot)) {
    throw new Error(`Release output directory not found: ${distRoot}`);
  }

  const candidates =
    process.platform === "darwin"
      ? findMacExecutables()
      : process.platform === "win32"
        ? findUnpackedExecutables(/^win.*-unpacked$|^win-unpacked$/, `${productName}.exe`)
        : process.platform === "linux"
          ? findUnpackedExecutables(/^linux.*-unpacked$|^linux-unpacked$/, productName)
          : [];

  if (candidates.length === 0) {
    throw new Error(`No packaged executable found for ${process.platform} in ${distRoot}`);
  }

  candidates.sort((left, right) => scoreCandidate(left) - scoreCandidate(right));
  return candidates[0];
}

function findMacExecutables() {
  const candidates = [];
  for (const dir of listDirs(distRoot).filter((entry) => entry.name.startsWith("mac"))) {
    for (const appBundle of listDirs(dir.path).filter((entry) => entry.name.endsWith(".app"))) {
      candidates.push(path.join(appBundle.path, "Contents", "MacOS", productName));
    }
  }
  return candidates.filter((candidate) => fs.existsSync(candidate));
}

function findUnpackedExecutables(pattern, executableName) {
  return listDirs(distRoot)
    .filter((entry) => pattern.test(entry.name))
    .map((entry) => path.join(entry.path, executableName))
    .filter((candidate) => fs.existsSync(candidate));
}

function listDirs(parent) {
  return fs
    .readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, path: path.join(parent, entry.name) }));
}

function scoreCandidate(candidate) {
  const normalized = candidate.toLowerCase();
  const separator = path.sep === "\\" ? "\\\\" : path.sep;
  if (normalized.includes(process.arch.toLowerCase())) return 0;
  if (process.arch === "x64" && new RegExp(`${separator}(mac|win-unpacked|linux-unpacked)${separator}`).test(normalized)) return 0;
  if (normalized.includes("universal")) return 1;
  return 2;
}

async function verifyExecutableArtifact(filePath) {
  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile()) throw new Error(`Packaged executable is not a file: ${filePath}`);
  const isWindowsExecutable = path.extname(filePath).toLowerCase() === ".exe";
  const minSize = isWindowsExecutable ? 1024 * 1024 : 16 * 1024;
  if (stat.size < minSize) throw new Error(`Packaged executable is unexpectedly small: ${filePath}`);

  if (isWindowsExecutable) {
    const header = Buffer.alloc(2);
    const handle = await fs.promises.open(filePath, "r");
    try {
      await handle.read(header, 0, header.length, 0);
    } finally {
      await handle.close();
    }
    if (header.toString("ascii") !== "MZ") {
      throw new Error(`Windows executable header check failed: ${filePath}`);
    }
  }
}

function waitForSpawn(childProcess) {
  return new Promise((resolve, reject) => {
    childProcess.once("spawn", resolve);
    childProcess.once("error", reject);
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function expectedUserDataPath(homeDir, dataDir) {
  if (process.platform === "darwin") return path.join(homeDir, "Library", "Application Support", productName);
  if (process.platform === "win32") return path.join(dataDir, "AppData", "Roaming", productName);
  return path.join(dataDir, "xdg-config", productName);
}

function comparablePath(value) {
  let normalized = path.resolve(value);
  if (process.platform === "darwin") normalized = normalized.replace(/^\/private(?=\/var\/)/, "");
  if (process.platform === "win32") normalized = normalized.toLowerCase();
  return normalized;
}

async function readSmokeUserData(reportPath) {
  try {
    const report = JSON.parse(await fs.promises.readFile(reportPath, "utf8"));
    return typeof report.userData === "string" ? report.userData : null;
  } catch {
    return null;
  }
}

async function terminateProcessTree(childProcess) {
  if (exited || !childProcess.pid) return;

  if (process.platform === "win32") {
    await runTaskkill(childProcess);
    return;
  }

  try {
    process.kill(-childProcess.pid, "SIGTERM");
  } catch {
    childProcess.kill("SIGTERM");
  }
  await delay(1500);
  if (exited) return;
  try {
    process.kill(-childProcess.pid, "SIGKILL");
  } catch {
    childProcess.kill("SIGKILL");
  }
}

function runTaskkill(childProcess) {
  return new Promise((resolve) => {
    const taskkill = spawn("taskkill", ["/pid", String(childProcess.pid), "/t", "/f"], { stdio: "ignore" });
    taskkill.on("exit", resolve);
    taskkill.on("error", () => {
      childProcess.kill("SIGTERM");
      resolve();
    });
  });
}

function createOutputBuffer() {
  const chunks = [];
  const maxBytes = 16 * 1024;
  let totalBytes = 0;
  return {
    add(chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      chunks.push(buffer);
      totalBytes += buffer.byteLength;
      while (totalBytes > maxBytes && chunks.length > 1) {
        const removed = chunks.shift();
        totalBytes -= removed.byteLength;
      }
    },
    text() {
      const value = Buffer.concat(chunks).toString("utf8").trim();
      return value.length > 0 ? value : "(no process output)";
    }
  };
}
