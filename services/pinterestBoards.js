const pinterestClient = require('./pinterestClient');

async function paginate(client, path, params = {}) {
  const items = [];
  let bookmark;
  do {
    const { data } = await client.get(path, { params: { ...params, page_size: 100, bookmark } });
    items.push(...(data.items || []));
    bookmark = data.bookmark;
  } while (bookmark);
  return items;
}

async function listBoards(account) {
  const client = await pinterestClient.forAccount(account);
  return paginate(client, '/boards', { privacy: 'ALL' });
}

async function listSections(account, boardId) {
  const client = await pinterestClient.forAccount(account);
  return paginate(client, `/boards/${boardId}/sections`);
}

async function createBoard(account, payload) {
  const client = await pinterestClient.forAccount(account);
  const { data } = await client.post('/boards', payload);
  return data;
}

async function updateBoard(account, boardId, payload) {
  const client = await pinterestClient.forAccount(account);
  const { data } = await client.patch(`/boards/${boardId}`, payload);
  return data;
}

async function deleteBoard(account, boardId) {
  const client = await pinterestClient.forAccount(account);
  await client.delete(`/boards/${boardId}`);
}

async function createSection(account, boardId, payload) {
  const client = await pinterestClient.forAccount(account);
  const { data } = await client.post(`/boards/${boardId}/sections`, payload);
  return data;
}

async function updateSection(account, boardId, sectionId, payload) {
  const client = await pinterestClient.forAccount(account);
  const { data } = await client.patch(`/boards/${boardId}/sections/${sectionId}`, payload);
  return data;
}

async function deleteSection(account, boardId, sectionId) {
  const client = await pinterestClient.forAccount(account);
  await client.delete(`/boards/${boardId}/sections/${sectionId}`);
}

async function getUserAccount(account) {
  const client = await pinterestClient.forAccount(account);
  const { data } = await client.get('/user_account');
  return data;
}

module.exports = {
  listBoards,
  listSections,
  createBoard,
  updateBoard,
  deleteBoard,
  createSection,
  updateSection,
  deleteSection,
  getUserAccount,
};
