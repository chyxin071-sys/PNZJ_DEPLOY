import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join, normalize, relative } from "node:path";

const ERP_PUBLIC_ROOT = join(process.cwd(), "public", "erp");

const contentTypes: Record<string, string> = {
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
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function safeJoinFromErpRoot(pathname: string) {
  const targetPath = normalize(join(ERP_PUBLIC_ROOT, pathname));
  const relativePath = relative(ERP_PUBLIC_ROOT, targetPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return null;
  }
  return targetPath;
}

async function readErpFile(pathname: string, cacheControl: string) {
  const filePath = safeJoinFromErpRoot(pathname);
  if (!filePath) {
    return null;
  }

  try {
    const body = await readFile(filePath);
    const extension = extname(filePath).toLowerCase();
    return new Response(body, {
      headers: {
        "cache-control": cacheControl,
        "content-type": contentTypes[extension] || "application/octet-stream",
      },
    });
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const assetPath = decodeURIComponent(url.pathname.replace(/^\/erp\/?/, ""));

  if (assetPath && assetPath !== "index.html") {
    const assetResponse = await readErpFile(assetPath, "public, max-age=31536000, immutable");
    if (assetResponse) {
      return assetResponse;
    }
  }

  const indexResponse = await readErpFile("index.html", "no-store");
  if (indexResponse) {
    return indexResponse;
  }

  return new Response("ERP has not been synced. Run `npm run sync:erp` before deployment.", {
    status: 503,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
