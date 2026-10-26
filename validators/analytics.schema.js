const { z } = require('zod');

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Invalid date');

const query = z.object({
  query: z.object({
    from: date.optional(),
    to: date.optional(),
    accountIds: z.string().optional(),
    sortBy: z.enum(['IMPRESSION', 'PIN_CLICK', 'OUTBOUND_CLICK', 'SAVE']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }),
});

const accountParams = z.object({
  params: z.object({ accountId: z.string().regex(/^[a-f\d]{24}$/i) }),
  query: query.shape.query,
});

const pinParams = z.object({
  params: z.object({ pinterestPinId: z.string().regex(/^\d+$/) }),
  query: query.shape.query,
});

module.exports = { query, accountParams, pinParams };
