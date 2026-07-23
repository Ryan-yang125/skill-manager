import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const siteRoot = path.join(repoRoot, "site");
const sitePrefix = "/skill-manager/";
const publicOrigin = "https://ryan-yang125.github.io";
const requiredFiles = [
  ".nojekyll",
  ".well-known/security.txt",
  "404.html",
  "index.html",
  "robots.txt",
  "sitemap.xml",
  "llms.txt",
  "pricing.md",
  "assets/styles.css",
  "assets/site.js",
  "assets/og-card.png",
  "fe11909f-5e4d-4d2e-8e7f-db04d2f7c613.txt",
  "guides/index.html",
  "guides/agent-skills-health-check/index.html",
  "guides/archive-restore-agent-skills/index.html",
  "guides/claude-skill-context-cost/index.html",
  "guides/codex-skills-locations/index.html",
  "guides/duplicate-agent-skills/index.html",
  "guides/find-unused-agent-skills/index.html"
];

for (const relativePath of requiredFiles) requireFile(relativePath);

const htmlFiles = (await walk(siteRoot)).filter((filePath) => filePath.endsWith(".html"));
for (const filePath of htmlFiles) {
  const relativePath = path.relative(siteRoot, filePath);
  const html = await fs.promises.readFile(filePath, "utf8");
  requireSingle(html, /<title>[^<]+<\/title>/gi, "title", relativePath);
  requireSingle(html, /<meta\s+name="description"\s+content="[^"]+"\s*\/?>/gi, "meta description", relativePath);
  requireSingle(html, /<link\s+rel="canonical"\s+href="[^"]+"\s*\/?>/gi, "canonical", relativePath);
  requireSingle(html, /<h1(?:\s[^>]*)?>[\s\S]*?<\/h1>/gi, "H1", relativePath);

  for (const match of html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
    try {
      JSON.parse(match[1]);
    } catch (error) {
      throw new Error(`${relativePath} contains invalid JSON-LD: ${error.message}`);
    }
  }

  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/gi)) {
    const target = match[1];
    if (target.startsWith("#")) {
      requireFragment(html, target.slice(1), relativePath);
      continue;
    }
    if (!target.startsWith(sitePrefix)) continue;
    const url = new URL(target, publicOrigin);
    const targetRelative = decodeURIComponent(url.pathname.slice(sitePrefix.length));
    const targetFile = targetRelative === "" || targetRelative.endsWith("/")
      ? path.join(targetRelative, "index.html")
      : targetRelative;
    requireFile(targetFile);
    if (url.hash && targetFile.endsWith(".html")) {
      const targetHtml = await fs.promises.readFile(path.join(siteRoot, targetFile), "utf8");
      requireFragment(targetHtml, decodeURIComponent(url.hash.slice(1)), `${relativePath} -> ${targetFile}`);
    }
  }
}

const sitemap = await fs.promises.readFile(path.join(siteRoot, "sitemap.xml"), "utf8");
for (const relativePath of requiredFiles.filter((file) => file.endsWith("index.html") && !file.startsWith("404"))) {
  const publicPath = relativePath === "index.html" ? "" : relativePath.slice(0, -"index.html".length);
  const url = `${publicOrigin}${sitePrefix}${publicPath}`;
  if (!sitemap.includes(`<loc>${url}</loc>`)) throw new Error(`sitemap.xml is missing ${url}`);
}

const robots = await fs.promises.readFile(path.join(siteRoot, "robots.txt"), "utf8");
if (!robots.includes(`${publicOrigin}${sitePrefix}sitemap.xml`)) throw new Error("robots.txt is missing the sitemap URL");

console.log(`Verified ${htmlFiles.length} HTML pages and ${requiredFiles.length} required site files`);

function requireFile(relativePath) {
  const filePath = path.join(siteRoot, relativePath);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`Missing site file: ${relativePath}`);
  }
}

function requireSingle(html, pattern, label, relativePath) {
  const matches = html.match(pattern) ?? [];
  if (matches.length !== 1) throw new Error(`${relativePath} must contain exactly one ${label}; found ${matches.length}`);
}

function requireFragment(html, fragment, relativePath) {
  if (!fragment) return;
  const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`\\bid=["']${escaped}["']`).test(html)) {
    throw new Error(`${relativePath} links to missing fragment #${fragment}`);
  }
}

async function walk(directory) {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(filePath)));
    if (entry.isFile()) files.push(filePath);
  }
  return files;
}
