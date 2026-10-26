const { z } = require('zod');

const scheduleRule = z
  .object({
    startAt: z.string().datetime({ offset: true }).optional(),
    intervalMinutes: z.number().int().min(1).max(1440).optional(),
    windowStart: z.string().optional(),
    windowEnd: z.string().optional(),
    perDay: z.number().int().min(1).max(100).optional(),
    jitterMinutes: z.number().int().min(0).max(720).optional(),
    timezone: z.string().min(1).max(100).optional(),
  })
  .strict()
  .optional();

const previewImages = z.object({
  body: z.object({
    accountId: z.string().regex(/^[a-f\d]{24}$/i),
    boardId: z.string().regex(/^[a-f\d]{24}$/i),
    assetIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(500),
    template: z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
        link: z.string().optional(),
        altText: z.string().optional(),
      })
      .strict()
      .optional(),
    scheduleRule,
    confirmCrossPost: z.boolean().optional(),
  }).strict(),
});

const commit = z.object({
  body: z.object({
    skipInvalid: z.boolean().optional(),
  }).strict(),
});

const previewCsv = z.object({
  body: z.object({
    accountId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
    scheduleRule: z.string().max(4000).optional(),
    confirmCrossPost: z.enum(['true', 'false']).optional(),
  }).strict(),
});

const editRow = z.object({
  body: z.object({
    accountId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
    board: z.string().max(200).optional(),
    section: z.string().max(200).optional(),
    title: z.string().max(100).optional(),
    description: z.string().max(800).optional(),
    link: z.string().max(2048).optional(),
    altText: z.string().max(500).optional(),
    assetId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
  }).strict(),
});

const batchParams = z.object({
  params: z.object({ batchId: z.string().regex(/^[a-f\d]{24}$/i) }),
});

const rowParams = z.object({
  params: z.object({
    batchId: z.string().regex(/^[a-f\d]{24}$/i),
    rowId: z.string().min(1).max(100),
  }),
});

module.exports = { previewCsv, previewImages, commit, editRow, batchParams, rowParams, scheduleRule };
