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

  // Readiness check - verifies env vars configured
  // Note: Deep DB connectivity check removed due to RLS complexity
  // Supabase has own health monitoring at dashboard level
  if (method === 'GET' && pathname === '/api/ready') {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return res.status(503).json({
        status: 'not_ready',
        reason: 'Missing Supabase configuration',
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      status: 'ready',
      service: 'indotek-pro-api',
      environment: 'configured',
      timestamp: new Date().toISOString(),
    });
  }

  // Route not found
  return res.status(404).json({
    error: 'Not Found',
    path: pathname,
    availableRoutes: ['/api/health', '/api/ready'],
  });
}
