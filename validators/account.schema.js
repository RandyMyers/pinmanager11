const { z } = require('zod');
const pinterest = require('../config/pinterest');

const allScopes = [...pinterest.SCOPES.default, ...pinterest.SCOPES.secret];
const timezone = z.string().min(1).max(100).refine((value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, 'Invalid timezone');

const connect = z.object({
  body: z.object({
    scopes: z.array(z.enum(allScopes)).min(1).max(allScopes.length).optional(),
    env: z.enum(['sandbox', 'production']).optional(),
    includeSecret: z.boolean().optional(),
  }),
});

const update = z.object({
  body: z.object({
    timezone: timezone.optional(),
    status: z.enum(['active', 'paused']).optional(),
    limits: z
      .object({
        dailyCap: z.number().int().min(1).max(500).optional(),
        minGapMinutes: z.number().int().min(0).max(1440).optional(),
        jitterMinutes: z.number().int().min(0).max(180).optional(),
      })
      .strict()
      .optional(),
  }).strict(),
});

module.exports = { connect, update };
