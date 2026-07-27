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
    signal: AbortSignal.timeout(8_000),
    headers: { "User-Agent": "PNZJ-Admin-Image-Proxy/1.0" },
  });
}

async function loadFirstAvailable(url: URL) {
  const candidates = [url];
  const fallback = cosFallback(url);
  if (fallback) candidates.push(fallback);
  const attempts = await Promise.allSettled(candidates.map(loadImage));
  const successful = attempts.find(
    (attempt): attempt is PromiseFulfilledResult<Response> =>
      attempt.status === "fulfilled" && attempt.value.ok,
  );
  if (successful) return successful.value;
  const firstResponse = attempts.find(
    (attempt): attempt is PromiseFulfilledResult<Response> =>
      attempt.status === "fulfilled",
  );
  if (firstResponse) return firstResponse.value;
  throw new Error("Image source unavailable");
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
    upstream = await loadFirstAvailable(url);
  } catch {
    return new Response("Image source unavailable", { status: 504 });
  }
  if (!upstream.ok) return new Response("Image source rejected the request", { status: upstream.status });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
    },
  });
}
