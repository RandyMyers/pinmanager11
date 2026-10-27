const { z } = require('zod');

const optionalHttpUrl = z.string().max(2048).refine((value) => {
  if (!value) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, 'Link must be an http(s) URL');

const register = z.object({
  body: z.object({
    publicId: z.string().min(1).max(500),
    originalFilename: z.string().max(255).optional(),
  }),
});

const update = z.object({
  params: z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }),
  body: z.object({
    title: z.string().max(100).optional(),
    description: z.string().max(800).optional(),
    altText: z.string().max(500).optional(),
    link: optionalHttpUrl.optional(),
  }).strict().refine((body) => Object.keys(body).length > 0, 'At least one asset field is required'),
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

module.exports = { sign, register, update, importUrl, list };
