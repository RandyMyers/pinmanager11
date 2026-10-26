function ok(res, data, meta, status = 200) {
  const payload = { data };
  if (meta !== undefined) payload.meta = meta;
  return res.status(status).json(payload);
}

module.exports = { ok };
