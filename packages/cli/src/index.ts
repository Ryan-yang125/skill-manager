import { runCli } from "./cli.js";

const exitCode = await runCli(process.argv.slice(2));
process.exitCode = exitCode;

export { runCli } from "./cli.js";
export * from "./format.js";
export * from "./report.js";
