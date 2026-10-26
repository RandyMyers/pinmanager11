const { z } = require('zod');

const register = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(1).max(80).optional(),
  }),
});

const login = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
});

module.exports = { register, login };
