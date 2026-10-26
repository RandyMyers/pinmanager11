const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const dateTime = z.string().datetime({ offset: true });
const httpUrl = z.string().max(2048).refine((value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, 'Link must be an http(s) URL');

const create = z.object({
  body: z.object({
    accountId: objectId,
    boardId: objectId.optional(),
    pinterestBoardId: z.string().regex(/^\d+$/).optional(),
    pinterestSectionId: z.string().regex(/^\d+$/).optional(),
    title: z.string().max(100).optional(),
    description: z.string().max(800).optional(),
    altText: z.string().max(500).optional(),
    link: httpUrl.optional(),
    assetId: objectId,
    coverAssetId: objectId.optional(),
    aiGenerated: z.boolean().optional(),
    scheduledAt: dateTime.optional(),
    status: z.enum(['draft', 'scheduled']).optional(),
    confirmCrossPost: z.boolean().optional(),
  }).strict().refine((body) => Boolean(body.boardId || body.pinterestBoardId), {
    message: 'A board is required',
  }).refine((body) => body.status !== 'scheduled' || Boolean(body.scheduledAt), {
    message: 'scheduledAt is required for scheduled posts',
  }),
});

const update = z.object({
  body: z.object({
    boardId: objectId.optional(),
    pinterestBoardId: z.string().regex(/^\d+$/).optional(),
    pinterestSectionId: z.string().regex(/^\d+$/).optional(),
    title: z.string().max(100).optional(),
    description: z.string().max(800).optional(),
    altText: z.string().max(500).optional(),
    link: httpUrl.optional(),
    assetId: objectId.optional(),
    coverAssetId: objectId.optional(),
    aiGenerated: z.boolean().optional(),
    scheduledAt: dateTime.optional(),
    status: z.enum(['draft', 'scheduled']).optional(),
  }).strict(),
});

const bulkAction = z.object({
  body: z.object({
    ids: z.array(objectId).min(1).max(500),
    action: z.enum(['cancel', 'delete', 'reschedule']),
    scheduledAt: dateTime.optional(),
  }).strict().refine((body) => body.action !== 'reschedule' || Boolean(body.scheduledAt), {
    message: 'scheduledAt is required when rescheduling',
  }),
});

const list = z.object({
  query: z.object({
    accountId: objectId.optional(),
    status: z.enum(['draft', 'scheduled', 'queued', 'publishing', 'published', 'failed', 'cancelled']).optional(),
    from: dateTime.optional(),
    to: dateTime.optional(),
    q: z.string().max(100).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

const idParams = z.object({ params: z.object({ id: objectId }) });

module.exports = { create, update, bulkAction, list, idParams };
