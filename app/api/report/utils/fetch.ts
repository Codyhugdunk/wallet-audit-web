// app/api/report/utils/fetch.ts
export const isVercel = process.env.VERCEL === "1";
export const isProd = process.env.NODE_ENV === "production";

// ✅ 只要不是 Vercel 且不是 production，就认为是本地/开发
export const isLocal = !isVercel && !isProd;

export async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = 15_000
) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      const msg =
        (json && (json.error || json.message)) ||
        text ||
        `HTTP_${res.status}`;
      throw new Error(msg);
    }

    return json;
  } finally {
    clearTimeout(id);
  }
}