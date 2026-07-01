import { spawn } from "node:child_process";

const signingEnvKeys = [
  "APPLE_API_ISSUER",
  "APPLE_API_KEY",
  "APPLE_API_KEY_ID",
  "APPLE_TEAM_ID",
  "CSC_KEY_PASSWORD",
  "CSC_LINK",
  "CSC_NAME",
  "WIN_CSC_KEY_PASSWORD",
  "WIN_CSC_LINK"
];

export function archArgs() {
  const value = process.env.SKILL_MANAGER_BUILD_ARCHS?.trim();
  if (!value) return [];
  return value
    .split(",")
    .map((arch) => arch.trim())
    .filter(Boolean)
    .map((arch) => `--${arch}`);
}

export function hasSigningIdentity(env) {
  return Boolean(env.CSC_LINK || env.CSC_NAME || env.WIN_CSC_LINK);
}

export function packageEnv() {
  const env = { ...process.env };
  for (const key of signingEnvKeys) {
    if (env[key] === "") {
      delete env[key];
    }
  }
  if (!hasSigningIdentity(env)) {
    env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
  }
  return env;
}

export function run(command, args, cwd, env = packageEnv()) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
    child.on("error", reject);
  });
}
