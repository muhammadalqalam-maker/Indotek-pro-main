import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { Redis } from '@upstash/redis';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { workflowRouter } from './src/server/routes';
import { supabaseAdmin } from './src/server/supabaseAdmin';
import { logger } from './src/server/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Upstash Redis Rate Limiter (serverless-safe, distributed)
const redis = process.env.UPSTASH_REDIS_REST_URL
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 120; // 120 reqs/min

/**
 * Get client IP with proper fallback chain.
 * Vercel sets CF-Connecting-IP (Cloudflare) or X-Forwarded-For if proxied.
 * Never trust X-Forwarded-For header directly; attackers can spoof.
 * Vercel environment: CF-Connecting-IP is authoritative.
 * Fallback: req.socket.remoteAddress for local dev.
 */
function getClientIp(req: Request): string {
  // Cloudflare header (set by Vercel/CF)
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  if (cfConnectingIp && typeof cfConnectingIp === 'string') {
    return cfConnectingIp.trim();
  }

  // X-Forwarded-For: only use first IP if behind single trusted proxy
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    const firstIp = forwarded.split(',')[0].trim();
    if (firstIp && /^[\d.a-f:]+$/i.test(firstIp)) {
      return firstIp;
    }
  }

  // Direct socket address (local dev or direct connection)
  return req.socket.remoteAddress || 'unknown';
}

async function workflowRateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = getClientIp(req);
  const key = `ratelimit:${ip}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  try {
    if (!redis) {
      // Fallback: no rate limiting if Upstash not configured
      logger.warn('Rate limiter skipped - Upstash Redis not configured', { ip });
      return next();
    }

    // Increment counter (Redis auto-expires old keys)
    const count = await redis.incr(key);
    if (count === 1) {
      // Set expiration only on first increment
      await redis.expire(key, Math.ceil(RATE_LIMIT_WINDOW_MS / 1000));
    }

    const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - count);
    const resetSeconds = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);

    res.setHeader('RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS.toString());
    res.setHeader('RateLimit-Remaining', remaining.toString());
    res.setHeader('RateLimit-Reset', resetSeconds.toString());

    if (count > RATE_LIMIT_MAX_REQUESTS) {
      res.setHeader('Retry-After', resetSeconds.toString());
      return res.status(429).json({
        error: 'Terlalu banyak permintaan pada API alur transaksi. Silakan tunggu beberapa saat.',
        success: false,
      });
    }

    next();
  } catch (err: any) {
    // If Redis fails, log but don't block traffic (fail open)
    logger.error('Rate limiter Redis error - failing open', { ip, key }, err);
    next();
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  // Helmet: secure HTTP headers (X-Frame-Options, HSTS, etc.)
  // contentSecurityPolicy: false to use custom CSP below
  app.use(
    helmet({
      contentSecurityPolicy: false, // Custom CSP below
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xContentTypeOptions: true,
      xXssProtection: true,
      frameguard: { action: 'deny' },
    })
  );

  // Custom Security Headers Middleware
  app.use((_req, res, next) => {
    // Content-Security-Policy: aligned with vercel.json
    // Remove 'unsafe-eval' (was security risk), tighten https: to specific Supabase origins
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'", // Keep unsafe-inline for React (common pattern)
        "worker-src 'self' blob:",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        `connect-src 'self' https://*.supabase.co wss://*.supabase.co https:${isProduction ? '' : ' ws://localhost:* ws://127.0.0.1:*'}`,
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
    );

    // Permissions-Policy: allow camera/geolocation for field report features
    // Set permissive here; Vercel edge can further restrict if needed
    res.setHeader(
      'Permissions-Policy',
      'camera=(self), microphone=(), geolocation=(self), payment=(), usb=()'
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
      logger.error('Health readiness probe failed', { endpoint: '/api/health/ready' }, err);
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
    logger.info('Indotek Pro server started', {
      port: PORT,
      mode: process.env.NODE_ENV || 'development',
      rateLimiterEnabled: !!redis,
    });
    if (!redis) {
      logger.warn('Upstash Redis not configured - rate limiting disabled');
    }
  });
}

export { workflowRateLimiter, startServer, getClientIp };

const isMainModule = Boolean(
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js')) &&
  !process.argv.some((arg) => arg.includes('test'))
);

if (isMainModule) {
  startServer().catch((err) => {
    logger.error('Failed to start server', {}, err);
    process.exit(1);
  });
}
