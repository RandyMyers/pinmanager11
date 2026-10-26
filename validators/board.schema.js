const { z } = require('zod');

const createBoard = z.object({
  body: z.object({
    name: z.string().min(1).max(50),
    description: z.string().max(500).optional(),
    privacy: z.enum(['PUBLIC', 'PROTECTED', 'SECRET']).optional(),
  }),
});

const updateBoard = z.object({
  body: z.object({
    name: z.string().min(1).max(50).optional(),
    description: z.string().max(500).optional(),
    privacy: z.enum(['PUBLIC', 'PROTECTED', 'SECRET']).optional(),
  }),
});

const createSection = z.object({
  body: z.object({
    name: z.string().min(1).max(180),
  }),
});

const bulkJobs = z.object({
  body: z.object({
    accountId: z.string().min(1),
    items: z
      .array(
        z.object({
          kind: z.enum(['board', 'section']),
          name: z.string().min(1),
          description: z.string().optional(),
          privacy: z.enum(['PUBLIC', 'PROTECTED', 'SECRET']).optional(),
          boardId: z.string().optional(),
          dependsOnIndex: z.number().optional(),
        })
      )
      .min(1)
      .max(200),
  }),
});

module.exports = { createBoard, updateBoard, createSection, bulkJobs };
