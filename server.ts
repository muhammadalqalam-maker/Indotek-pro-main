import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { workflowRouter } from './src/server/routes';
import { supabaseAdmin } from './src/server/supabaseAdmin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-Memory Lightweight Rate Limiter for /api/workflows
interface RateLimitEntry {
  count: number;
  resetTime: number;
}
const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 120; // 120 reqs/min

function workflowRateLimiter(req: Request, res: Response, next: NextFunction) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : (req.socket.remoteAddress || 'unknown');
  const now = Date.now();

  // Periodic random cleanup of expired keys
  if (Math.random() < 0.05) {
    for (const [key, entry] of rateLimitMap.entries()) {
      if (now > entry.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }

  let entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetTime) {
    entry = { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(ip, entry);
  } else {
    entry.count += 1;
  }

  const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - entry.count);
  const resetSeconds = Math.ceil((entry.resetTime - now) / 1000);

  res.setHeader('RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS.toString());
  res.setHeader('RateLimit-Remaining', remaining.toString());
  res.setHeader('RateLimit-Reset', resetSeconds.toString());

  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    res.setHeader('Retry-After', resetSeconds.toString());
    return res.status(429).json({
      error: 'Terlalu banyak permintaan pada API alur transaksi. Silakan tunggu beberapa saat.',
      success: false,
    });
  }

  next();
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  // Security Headers Middleware (Express replacement for Firebase Hosting headers)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
        "style-src 'self' 'unsafe-inline' https: https://fonts.googleapis.com",
        "font-src 'self' https: data: https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https: wss:",
        "frame-ancestors 'self' https://*.google.com https://*.run.app https://*.googleusercontent.com",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
    );
    next();
  });

  app.use(express.json());

  // 1. Transactional Workflow Routes with Rate Limiting
  app.use('/api/workflows', workflowRateLimiter, workflowRouter);

  // 2. Liveness Health Check (responds quickly without external dependency)
  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'Indotek Pro Enterprise Trusted Backend',
      engine: 'Express + Supabase (PostgreSQL + RLS + RPC)',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // 3. Readiness Health Check (probes Supabase database connection)
  app.get('/api/health/ready', async (_req: Request, res: Response) => {
    try {
      // Lightweight single doc probe via Supabase
      const { error } = await supabaseAdmin.from('workspaces').select('id').limit(1);
      if (error && error.code !== 'PGRST116') {
        throw new Error(error.message);
      }
      res.status(200).json({
        status: 'ready',
        service: 'Indotek Pro Enterprise Trusted Backend',
        database: 'connected (Supabase PostgreSQL)',
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[Health Readiness Probe Failed]:', err?.message || err);
      res.status(503).json({
        status: 'unavailable',
        service: 'Indotek Pro Enterprise Trusted Backend',
        database: 'disconnected',
        error: err?.message || 'Database connection probe failed',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // 4. Static Bundle / SPA Execution
  if (!isProduction) {
    // Mount Vite Dev Server Middlewares for Development execution
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve the compiled static build from dist/
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Indotek Pro] Trusted Server active on port ${PORT} (mode: ${process.env.NODE_ENV || 'development'})`);
  });
}

export { workflowRateLimiter, startServer, rateLimitMap };

const isMainModule = Boolean(
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js')) &&
  !process.argv.some((arg) => arg.includes('test'))
);

if (isMainModule) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
