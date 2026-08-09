import http from "node:http";
import https from "node:https";
import { SocksProxyAgent } from "socks-proxy-agent";

const PROXY_URL = (
  process.env.DEEPSEEK_PROXY_URL ||
  "socks5://gpyU3o:PuaYrq@185.97.79.162:8000"
).trim();

let proxyAgent: SocksProxyAgent | undefined;
try {
  proxyAgent = new SocksProxyAgent(PROXY_URL);
} catch (err) {
  console.error(
    "[proxy-fetch] Invalid DEEPSEEK_PROXY_URL, falling back to direct fetch:",
    err,
  );
}

export const proxiedFetch: typeof fetch = (input, init) => {
  const agent = proxyAgent;
  if (!agent) return fetch(input, init);

  const url = new URL(String(input));
  const isHttps = url.protocol === "https:";
  const transport = isHttps ? https : http;
  const method = init?.method ?? "GET";
  const headers = new Headers(init?.headers);
  const body = init?.body;
  const signal = init?.signal ?? undefined;

  return new Promise((resolve, reject) => {
    let resRef: http.IncomingMessage | null = null;
    let settled = false;

    const abortHandler = () => {
      if (settled) {
        resRef?.destroy();
        return;
      }
      settled = true;
      signal?.removeEventListener("abort", abortHandler);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };

    if (signal) {
      if (signal.aborted) {
        abortHandler();
        return;
      }
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    const req = transport.request(
      url,
      {
        method,
        headers: Object.fromEntries(headers.entries()),
        agent,
        signal,
      },
      (res) => {
        resRef = res;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            res.on("data", (chunk: Buffer) =>
              controller.enqueue(new Uint8Array(chunk)),
            );
            res.on("end", () => controller.close());
            res.on("error", (err) => controller.error(err));
          },
          cancel() {
            res.destroy();
          },
        });

        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (key === "transfer-encoding" || key === "connection") continue;
          if (value === undefined) continue;
          if (Array.isArray(value)) {
            for (const v of value) responseHeaders.append(key, v);
          } else {
            responseHeaders.set(key, value);
          }
        }

        settled = true;
        resolve(
          new Response(stream, {
            status: res.statusCode ?? 200,
            statusText: res.statusMessage ?? undefined,
            headers: responseHeaders,
          }),
        );
      },
    );

    req.on("error", (err) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abortHandler);
      reject(err);
    });

    if (body == null) {
      req.end();
    } else if (typeof body === "string" || body instanceof Uint8Array) {
      req.write(body);
      req.end();
    } else if (body instanceof ReadableStream) {
      const reader = body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            req.write(value);
          }
          req.end();
        } catch (err) {
          req.destroy(err as Error);
        }
      };
      void pump();
    } else {
      req.destroy(new TypeError("Unsupported request body type"));
    }
  });
};
