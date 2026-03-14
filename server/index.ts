import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";

// Simple cookie parser middleware
function cookieParser(req: any, res: any, next: any) {
  const cookies: Record<string, string> = {};
  if (req.headers.cookie) {
    req.headers.cookie.split(';').forEach((cookie: string) => {
      const [key, val] = cookie.trim().split('=');
      cookies[key] = decodeURIComponent(val);
    });
  }
  req.cookies = cookies;
  
  // Override res.cookie to set cookies
  const originalCookie = res.cookie;
  res.cookie = function(name: string, value: string, options: any = {}) {
    let setCookieValue = `${name}=${encodeURIComponent(value)}`;
    setCookieValue += `; Path=${options.path || '/'}`;
    if (options.maxAge) {
      setCookieValue += `; Max-Age=${options.maxAge}`;
    }
    if (options.httpOnly) {
      setCookieValue += '; HttpOnly';
    }
    if (options.secure) {
      setCookieValue += '; Secure';
    }
    if (options.sameSite) {
      setCookieValue += `; SameSite=${options.sameSite}`;
    }
    res.setHeader('Set-Cookie', setCookieValue);
    return this;
  };
  
  next();
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser);

function isVolatileApiPath(path: string) {
  return (
    path === "/api/state" ||
    path === "/api/auction-mode" ||
    path.startsWith("/api/auction") ||
    path.startsWith("/api/instant-auction")
  );
}

app.use((req, res, next) => {
  if (isVolatileApiPath(req.path)) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      console.log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = (err as { status?: number; statusCode?: number })?.status??
      (err as { status?: number; statusCode?: number })?.statusCode??
      500;
    const message = (err as { message?: string })?.message ?? "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
  });
})();
