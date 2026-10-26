const { parse } = require('csv-parse/sync');
const { parse: parseDate, isValid } = require('date-fns');
const { fromZonedTime } = require('date-fns-tz');
const AppError = require('../utils/AppError');

const HEADER_MAP = {
  account: 'account',
  board: 'board',
  section: 'section',
  title: 'title',
  description: 'description',
  link: 'link',
  alt_text: 'altText',
  alttext: 'altText',
  image_url: 'imageUrl',
  imageurl: 'imageUrl',
  image_file: 'imageFile',
  imagefile: 'imageFile',
  scheduled_at: 'scheduledAt',
  scheduledat: 'scheduledAt',
};

function parseCsv(buffer) {
  let records;
  try {
    records = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (err) {
    throw new AppError(400, 'VALIDATION', 'Could not parse CSV', { message: err.message });
  }
  if (records.length > 500) {
    throw new AppError(400, 'VALIDATION', 'CSV is limited to 500 rows');
  }

  const rows = records.map((raw, index) => {
    const data = {};
    for (const [key, value] of Object.entries(raw)) {
      const mapped = HEADER_MAP[String(key).trim().toLowerCase().replace(/\s+/g, '_')];
      if (mapped) data[mapped] = value;
    }
    const errors = [];
    const warnings = [];
    if (!data.board) errors.push('board is required');
    if (!data.imageUrl && !data.imageFile) errors.push('image_url or image_file is required');
    if (data.title && data.title.length > 100) errors.push('title exceeds 100 characters');
    if (data.description && data.description.length > 800) errors.push('description exceeds 800 characters');
    if (data.altText && data.altText.length > 500) errors.push('alt_text exceeds 500 characters');
    if (data.link) {
      if (data.link.length > 2048) errors.push('link exceeds 2048 characters');
      else {
        try {
          if (!['http:', 'https:'].includes(new URL(data.link).protocol)) {
            errors.push('link must be an http(s) URL');
          }
        } catch {
          errors.push('link must be a valid http(s) URL');
        }
      }
    }
    return { row: index + 2, data, errors, warnings };
  });

  return {
    rows,
    summary: {
      rowCount: rows.length,
      validCount: rows.filter((r) => r.errors.length === 0).length,
      errorCount: rows.filter((r) => r.errors.length > 0).length,
    },
  };
}

function parseScheduledAt(value, timezone = 'UTC') {
  if (!value) return undefined;
  const input = String(value).trim();
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(input);
  if (hasOffset) {
    const date = new Date(input);
    if (!Number.isNaN(date.getTime())) return date;
  }

  const localInput = input.replace('T', ' ');
  const date = parseDate(localInput, 'yyyy-MM-dd HH:mm', new Date());
  if (!isValid(date) || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(localInput)) {
    throw new AppError(400, 'VALIDATION', 'scheduled_at must be ISO 8601 or YYYY-MM-DD HH:mm');
  }
  try {
    return fromZonedTime(date, timezone);
  } catch {
    throw new AppError(400, 'VALIDATION', 'Invalid scheduled_at timezone');
  }
}

module.exports = { parseCsv, parseScheduledAt };
