import express, { Request, Response, NextFunction } from 'express';
import { workflowRouter } from './routes';
import { supabaseAdmin } from './supabaseAdmin';

// In-Memory Lightweight Rate Limiter for /api/workflows
export interface RateLimitEntry {
  count: number;
  resetTime: number;
}
export const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 120; // 120 reqs/min

export function workflowRateLimiter(req: Request, res: Response, next: NextFunction) {
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

export function createExpressApp() {
  const app = express();

  // Security Headers Middleware
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

  // Vercel rewrite URL normalizer
  app.use((req, _res, next) => {
    const matchedPath = req.headers['x-matched-path'];
    if (typeof matchedPath === 'string' && matchedPath.startsWith('/api') && !req.url.startsWith('/api')) {
      req.url = matchedPath;
    }
    next();
  });

  // 1. Transactional Workflow Routes with Rate Limiting
  // Supports both /api/workflows and /workflows
  app.use('/api/workflows', workflowRateLimiter, workflowRouter);
  app.use('/workflows', workflowRateLimiter, workflowRouter);

  // 2. Liveness Health Check (responds quickly without external dependency)
  const healthHandler = (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'Indotek Pro Enterprise Trusted Backend',
      engine: 'Express + Supabase (PostgreSQL + RLS + RPC)',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  };
  app.get('/api', healthHandler);
  app.get('/api/health', healthHandler);
  app.get('/health', healthHandler);

  // 3. Readiness Health Check (probes Supabase database connection)
  const readyHandler = async (_req: Request, res: Response) => {
    try {
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
  };
  app.get('/api/health/ready', readyHandler);
  app.get('/health/ready', readyHandler);

  return app;
}

export const app = createExpressApp();
export default app;
