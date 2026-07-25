import { access, cp, mkdir, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(scriptDir, "..");
const defaultErpRoot = "E:\\XIN Lab\\PNZJ\\CM1.0-main-local-avatar-preview\\ERP";
const erpRoot = path.resolve(process.env.ERP_SOURCE_DIR || defaultErpRoot);
const erpDist = path.join(erpRoot, "dist");
const publicRoot = path.join(adminRoot, "public");
const targetDir = path.join(publicRoot, "erp");
const assetTargetDir = path.join(publicRoot, "assets", "erp");

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function ensureInsidePublic(filePath) {
  const relativePath = path.relative(publicRoot, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Refusing to write outside public directory: ${filePath}`);
  }
}

if (!(await exists(path.join(erpRoot, "package.json")))) {
  throw new Error(`ERP source directory is invalid: ${erpRoot}`);
}

console.log(`[sync:erp] Building ERP from ${erpRoot}`);
const buildResult = spawnSync("npm run build", {
  cwd: erpRoot,
  env: {
    ...process.env,
    ERP_ASSET_BASE: "/assets/erp/",
  },
  shell: true,
  stdio: "inherit",
});

if (buildResult.error) {
  throw buildResult.error;
}

if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

if (!(await exists(path.join(erpDist, "index.html")))) {
  throw new Error(`ERP build did not create ${path.join(erpDist, "index.html")}`);
}

ensureInsidePublic(targetDir);
ensureInsidePublic(assetTargetDir);
console.log(`[sync:erp] Copying ${erpDist} -> ${targetDir}`);
await rm(targetDir, { recursive: true, force: true });
await rm(assetTargetDir, { recursive: true, force: true });
await mkdir(publicRoot, { recursive: true });
await cp(erpDist, targetDir, { recursive: true });
await mkdir(path.dirname(assetTargetDir), { recursive: true });
await cp(erpDist, assetTargetDir, { recursive: true });

console.log("[sync:erp] ERP static files are ready at /erp and /assets/erp");
