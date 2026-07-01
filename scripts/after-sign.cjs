const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  if (process.env.SKIP_ADHOC_SIGN === "1") return;
  if (context.packager.platformSpecificBuildOptions?.identity !== "-") return;

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  if (!fs.existsSync(appPath)) return;

  const result = spawnSync(
    "codesign",
    ["--force", "--deep", "--sign", "-", appPath],
    {
      encoding: "utf8",
      stdio: "pipe"
    }
  );

  if (result.status !== 0) {
    throw new Error(`Ad-hoc codesign failed: ${result.stderr || result.stdout}`);
  }
};
