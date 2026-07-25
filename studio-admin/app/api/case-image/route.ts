const ALLOWED_HOSTS = [
  /\.tcb\.qcloud\.la$/i,
  /\.cos\.ap-shanghai\.myqcloud\.com$/i,
];

function isAllowed(url: URL) {
  return url.protocol === "https:" && ALLOWED_HOSTS.some((pattern) => pattern.test(url.hostname));
}

function cosFallback(url: URL) {
  const match = url.hostname.match(/^(.+)\.tcb\.qcloud\.la$/i);
  if (!match) return null;
  const fallback = new URL(url);
  fallback.hostname = `${match[1]}.cos.ap-shanghai.myqcloud.com`;
  return fallback;
}

async function loadImage(url: URL) {
  return fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": "PNZJ-Admin-Image-Proxy/1.0" },
  });
}

export async function GET(request: Request) {
  const source = new URL(request.url).searchParams.get("url");
  if (!source) return new Response("Missing image URL", { status: 400 });

  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return new Response("Invalid image URL", { status: 400 });
  }
  if (!isAllowed(url)) return new Response("Image host is not allowed", { status: 403 });

  let upstream: Response;
  try {
    upstream = await loadImage(url);
  } catch {
    const fallback = cosFallback(url);
    if (!fallback) return new Response("Image source unavailable", { status: 504 });
    try {
      upstream = await loadImage(fallback);
    } catch {
      return new Response("Image source unavailable", { status: 504 });
    }
  }

  if (!upstream.ok) {
    const fallback = cosFallback(url);
    if (fallback) {
      try {
        const retry = await loadImage(fallback);
        if (retry.ok) upstream = retry;
      } catch {
        // Keep the original upstream response and status.
      }
    }
  }
  if (!upstream.ok) return new Response("Image source rejected the request", { status: upstream.status });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "private, max-age=300",
    },
  });
}
