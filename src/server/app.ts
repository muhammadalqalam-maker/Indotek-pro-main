import express, { Request, Response, NextFunction } from 'express';
import { workflowRouter } from './routes';
import { supabaseAdmin } from './supabaseAdmin';
import { standardRateLimit } from './rateLimit';

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
  app.use('/api/workflows', standardRateLimit, workflowRouter);
  app.use('/workflows', standardRateLimit, workflowRouter);

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
