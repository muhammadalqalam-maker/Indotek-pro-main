/**
 * Vercel Serverless Function: api/index
 * Health check endpoint for production monitoring
 *
 * Routes:
 * - GET /api/health  -> basic health check
 * - GET /api/ready   -> readiness check with DB connectivity
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method, url } = req;
  const pathname = new URL(url || '/', `http://${req.headers.host}`).pathname;

  // Health check
  if (method === 'GET' && pathname === '/api/health') {
    return res.status(200).json({
      status: 'healthy',
      service: 'indotek-pro-api',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  }

  // Readiness check with Supabase connectivity
  if (method === 'GET' && pathname === '/api/ready') {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(503).json({
          status: 'not_ready',
          reason: 'Missing Supabase configuration',
          timestamp: new Date().toISOString(),
        });
      }

      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      // Simple query to verify DB connectivity
      const { error } = await supabase.from('workspaces').select('id').limit(1);

      if (error) {
        return res.status(503).json({
          status: 'not_ready',
          reason: 'Database connectivity failed',
          details: error.message,
          timestamp: new Date().toISOString(),
        });
      }

      return res.status(200).json({
        status: 'ready',
        service: 'indotek-pro-api',
        database: 'connected',
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(503).json({
        status: 'not_ready',
        reason: 'Health check failed',
        details: err?.message || String(err),
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Route not found
  return res.status(404).json({
    error: 'Not Found',
    path: pathname,
    availableRoutes: ['/api/health', '/api/ready'],
  });
}
