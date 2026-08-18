import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { constants } from "node:fs";
import { extname, isAbsolute, join, normalize, relative } from "node:path";
import { spawn } from "node:child_process";
import { handleOperationsScreenApi } from "./operations-screen-api.mjs";

const publicPort = Number(process.env.PORT || 3000);
const internalPort = Number(process.env.VINEXT_INTERNAL_PORT || (publicPort === 80 ? 3000 : publicPort + 1));
const host = process.env.HOST || "0.0.0.0";
const root = process.cwd();
const publicRoot = join(root, "public");
const erpRoot = join(publicRoot, "erp");
const erpAssetRoot = join(publicRoot, "assets", "erp");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function safeJoin(baseDir, pathname) {
  const targetPath = normalize(join(baseDir, pathname));
  const relativePath = relative(baseDir, targetPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return null;
  }
  return targetPath;
}

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function serveFile(res, baseDir, pathname, cacheControl = "public, max-age=3600") {
  const filePath = safeJoin(baseDir, pathname);
  if (!filePath || !(await exists(filePath))) {
    return false;
  }

  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    return false;
  }

  const extension = extname(filePath).toLowerCase();
  res.writeHead(200, {
    "cache-control": cacheControl,
    "content-length": String(fileStat.size),
    "content-type": contentTypes[extension] || "application/octet-stream",
  });
  createReadStream(filePath).pipe(res);
  return true;
}

function proxyToVinext(req, res) {
  const proxyReq = httpRequest(
    {
      hostname: "127.0.0.1",
      port: internalPort,
      method: req.method,
      path: req.url,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", (error) => {
    console.error("[unified] Vinext proxy error:", error.message);
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    }
    res.end("Service is starting, please retry shortly.");
  });

  req.pipe(proxyReq);
}

const vinext = spawn(
  process.execPath,
  ["node_modules/vinext/dist/cli.js", "start", "-p", String(internalPort)],
  {
    env: {
      ...process.env,
      PORT: String(internalPort),
    },
    stdio: "inherit",
  },
);

vinext.on("exit", (code, signal) => {
  if (signal) {
    process.exit(0);
  }
  process.exit(code ?? 1);
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/api/health") {
    const vinextRunning = vinext.exitCode === null && vinext.signalCode === null;
    res.writeHead(vinextRunning ? 200 : 503, {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify({ success: vinextRunning }));
    return;
  }

  if (await handleOperationsScreenApi(req, res, url)) {
    return;
  }

  if (pathname === "/ljCjuUEYbP.txt") {
    res.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    });
    res.end("0ab969a492437da11868eb8efc2bb05d");
    return;
  }

  if (pathname.startsWith("/assets/erp/")) {
    const served = await serveFile(
      res,
      erpAssetRoot,
      pathname.replace(/^\/assets\/erp\/?/, ""),
      "public, max-age=31536000, immutable",
    );
    if (served) {
      return;
    }
  }

  if (pathname.startsWith("/erp/assets/")) {
    const served = await serveFile(
      res,
      erpRoot,
      pathname.replace(/^\/erp\/?/, ""),
      "public, max-age=31536000, immutable",
    );
    if (served) {
      return;
    }
  }

  if (pathname === "/erp" || pathname === "/erp/" || pathname.startsWith("/erp/")) {
    const directAssetPath = pathname.replace(/^\/erp\/?/, "");
    if (directAssetPath && directAssetPath.includes(".")) {
      const served = await serveFile(res, erpRoot, directAssetPath);
      if (served) {
        return;
      }
    }

    const servedIndex = await serveFile(res, erpRoot, "index.html", "no-store");
    if (servedIndex) {
      return;
    }
  }

  proxyToVinext(req, res);
});

server.listen(publicPort, host, () => {
  console.log(`[unified] Public server running at http://${host}:${publicPort}`);
  console.log(`[unified] Vinext internal server on port ${internalPort}`);
});

function shutdown() {
  server.close();
  vinext.kill("SIGTERM");
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
