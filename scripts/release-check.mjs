import { spawn } from "node:child_process";

const commands = [
  ["pnpm", ["install", "--frozen-lockfile"]],
  ["pnpm", ["lint"]],
  ["pnpm", ["test"]],
  ["pnpm", ["build"]],
  ["pnpm", ["site:verify"]],
  ["pnpm", ["smoke"]],
  ["pnpm", ["audit"]]
];

for (const [command, args] of commands) {
  await run(command, args);
}

console.log("Release check passed");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
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
