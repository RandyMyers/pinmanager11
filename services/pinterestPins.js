const axios = require('axios');
const pinterestClient = require('./pinterestClient');
const cloudinaryService = require('./cloudinaryService');
const AppError = require('../utils/AppError');
const env = require('../config/env');

function trialGuard(account) {
  if (account.env === 'production' && !env.PINTEREST_STANDARD_APPROVED) {
    throw new AppError(
      403,
      'TRIAL_PRODUCTION',
      'Trial apps cannot create Pins in production. Use sandbox or set PINTEREST_STANDARD_APPROVED after Standard access.'
    );
  }
}

async function createImagePin(account, post, asset) {
  trialGuard(account);
  const client = await pinterestClient.forAccount(account);
  const url = cloudinaryService.buildPinterestUrl(asset.cloudinaryPublicId, asset.secureUrl);
  const body = {
    board_id: post.pinterestBoardId,
    title: post.title || undefined,
    description: post.description || undefined,
    alt_text: post.altText || undefined,
    link: post.link || undefined,
    media_source: { source_type: 'image_url', url, is_standard: true },
  };
  if (post.pinterestSectionId) body.board_section_id = post.pinterestSectionId;
  if (post.aiGenerated) body.ai_disclosures = { are_pins_created_with_ai: true };
  try {
    const { data } = await client.post('/pins', body);
    return data;
  } catch (err) {
    if (
      err.code === 'TRANSIENT' &&
      !['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(err.details?.networkCode)
    ) {
      throw new AppError(
        502,
        'PUBLISH_OUTCOME_UNKNOWN',
        'Pinterest may have received this Pin request. Verify on Pinterest before retrying.'
      );
    }
    throw err;
  }
}

async function createVideoPin(account, post, asset, coverAsset) {
  trialGuard(account);
  const client = await pinterestClient.forAccount(account);
  const { data: media } = await client.post('/media', { media_type: 'video' });
  const fileRes = await axios.get(asset.secureUrl, { responseType: 'arraybuffer', timeout: 120000 });
  const form = new FormData();
  Object.entries(media.upload_parameters || {}).forEach(([key, value]) => form.append(key, value));
  form.append('file', new Blob([fileRes.data]), asset.originalFilename || 'video.mp4');
  const upload = await axios.post(media.upload_url, form, { timeout: 120000, validateStatus: () => true });
  if (upload.status !== 204 && upload.status !== 200) {
    throw new AppError(502, 'VALIDATION', 'Pinterest video upload failed');
  }

  const deadline = Date.now() + 5 * 60 * 1000;
  let status = 'registered';
  while (Date.now() < deadline) {
    const { data: poll } = await client.get(`/media/${media.media_id}`);
    status = poll.status;
    if (status === 'succeeded') break;
    if (status === 'failed') throw new AppError(502, 'VALIDATION', 'Pinterest video processing failed');
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (status !== 'succeeded') {
    throw new AppError(504, 'TRANSIENT', 'Timed out waiting for Pinterest video processing');
  }

  const cover = coverAsset
    ? cloudinaryService.buildPinterestUrl(coverAsset.cloudinaryPublicId, coverAsset.secureUrl)
    : undefined;
  if (!cover) throw new AppError(400, 'VALIDATION', 'Video Pins require a cover image');

  const body = {
    board_id: post.pinterestBoardId,
    title: post.title || undefined,
    description: post.description || undefined,
    alt_text: post.altText || undefined,
    link: post.link || undefined,
    media_source: { source_type: 'video_id', media_id: media.media_id, cover_image_url: cover },
  };
  if (post.pinterestSectionId) body.board_section_id = post.pinterestSectionId;
  if (post.aiGenerated) body.ai_disclosures = { are_pins_created_with_ai: true };
  try {
    const { data } = await client.post('/pins', body);
    return data;
  } catch (err) {
    if (
      err.code === 'TRANSIENT' &&
      !['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(err.details?.networkCode)
    ) {
      throw new AppError(
        502,
        'PUBLISH_OUTCOME_UNKNOWN',
        'Pinterest may have received this Pin request. Verify on Pinterest before retrying.'
      );
    }
    throw err;
  }
}

async function deletePin(account, pinId) {
  const client = await pinterestClient.forAccount(account);
  await client.delete(`/pins/${pinId}`);
}

module.exports = { createImagePin, createVideoPin, deletePin };
