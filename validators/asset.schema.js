const { z } = require('zod');

const register = z.object({
  body: z.object({
    publicId: z.string().min(1).max(500),
    originalFilename: z.string().max(255).optional(),
  }),
});

const sign = z.object({
  body: z.object({
    tags: z.array(z.string().min(1).max(100)).max(20).optional(),
    resourceType: z.enum(['image', 'video']).optional(),
  }).strict(),
});

const importUrl = z.object({
  body: z.object({
    url: z.string().url().max(2048).refine((value) => {
      try {
        return new URL(value).protocol === 'https:';
      } catch {
        return false;
      }
    }, 'Only https URLs are allowed'),
  }),
});

const list = z.object({
  query: z.object({
    q: z.string().max(200).optional(),
    type: z.enum(['image', 'video']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }),
});

module.exports = { sign, register, importUrl, list };
