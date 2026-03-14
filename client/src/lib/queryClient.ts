import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

function isVolatileQueryPath(path: string) {
  return (
    path === "/api/state" ||
    path === "/api/auction-mode" ||
    path.startsWith("/api/auction") ||
    path.startsWith("/api/instant-auction")
  );
}

function extractErrorMessage(payload: unknown): string | null {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const asRecord = payload as Record<string, unknown>;

  if (typeof asRecord.message === "string" && asRecord.message.trim().length > 0) {
    return asRecord.message.trim();
  }

  if (typeof asRecord.error === "string" && asRecord.error.trim().length > 0) {
    return asRecord.error.trim();
  }

  if (Array.isArray(asRecord.errors) && asRecord.errors.length > 0) {
    const firstError = asRecord.errors[0];
    if (typeof firstError === "string" && firstError.trim().length > 0) {
      return firstError.trim();
    }
    if (
      firstError &&
      typeof firstError === "object" &&
      typeof (firstError as Record<string, unknown>).message === "string" &&
      (firstError as Record<string, unknown>).message?.trim().length > 0
    ) {
      return ((firstError as Record<string, unknown>).message as string).trim();
    }
  }

  return null;
}

function parseErrorMessageFromText(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return extractErrorMessage(parsed) ?? trimmed;
  } catch {
    return trimmed;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    const parsedMessage = parseErrorMessageFromText(text);
    const fallbackMessage = res.statusText.trim().length > 0 ? res.statusText : "Request failed";
    throw new Error(parsedMessage ?? fallbackMessage);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const queryPath = queryKey.join("/");
    const requestUrl = `${API_BASE}${queryPath}`;
    const volatileRequest = isVolatileQueryPath(queryPath);

    const res = await fetch(
      requestUrl,
      volatileRequest
        ? {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
            },
          }
        : undefined,
    );

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
