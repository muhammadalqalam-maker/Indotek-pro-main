import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import type { Request, Response, NextFunction } from 'express';

// Initialize Upstash Redis client
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

// Rate limiters for different endpoint types
const strictLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 requests per minute
      analytics: true,
      prefix: '@indotek/strict',
    })
  : null;

const moderateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, '1 m'), // 30 requests per minute
      analytics: true,
      prefix: '@indotek/moderate',
    })
  : null;

const standardLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, '1 m'), // 60 requests per minute
      analytics: true,
      prefix: '@indotek/standard',
    })
  : null;

/**
 * Rate limiting middleware factory
 * @param limiterType - Type of limiter to apply: 'strict', 'moderate', or 'standard'
 * @returns Express middleware
 */
export function rateLimitMiddleware(limiterType: 'strict' | 'moderate' | 'standard' = 'standard') {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip rate limiting if Redis not configured (dev/test environments)
    if (!redis) {
      return next();
    }

    const limiter = limiterType === 'strict' 
      ? strictLimiter 
      : limiterType === 'moderate' 
      ? moderateLimiter 
      : standardLimiter;

    if (!limiter) {
      return next();
    }

    // Use IP address as identifier, fallback to 'anonymous'
    const identifier = req.ip || req.socket.remoteAddress || 'anonymous';

    try {
      const { success, limit, reset, remaining } = await limiter.limit(identifier);

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', limit.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', reset.toString());

      if (!success) {
        return res.status(429).json({
          error: 'Terlalu banyak permintaan. Silakan coba lagi nanti.',
          retryAfter: Math.ceil((reset - Date.now()) / 1000),
        });
      }

      next();
    } catch (error) {
      // Log error but don't block request if rate limiting fails
      console.error('Rate limiting error:', error);
      next();
    }
  };
}

/**
 * Apply strict rate limiting (10 req/min) - for sensitive operations
 */
export const strictRateLimit = rateLimitMiddleware('strict');

/**
 * Apply moderate rate limiting (30 req/min) - for write operations
 */
export const moderateRateLimit = rateLimitMiddleware('moderate');

/**
 * Apply standard rate limiting (60 req/min) - for read operations
 */
export const standardRateLimit = rateLimitMiddleware('standard');
