const Board = require('../models/Board');
const pinterestBoards = require('../services/pinterestBoards');
const { syncAccountBoards } = require('../services/boardSyncService');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { ok } = require('../utils/response');

const list = asyncHandler(async (req, res) => {
  if (req.query.refresh === 'true') {
    const boards = await syncAccountBoards(req.account);
    return ok(res, boards);
  }
  const boards = await Board.find({ account: req.account._id, deletedOnPinterest: false }).sort({ name: 1 });
  return ok(res, boards);
});

const create = asyncHandler(async (req, res) => {
  const created = await pinterestBoards.createBoard(req.account, {
    name: req.body.name,
    description: req.body.description,
    privacy: req.body.privacy || 'PUBLIC',
  });
  const board = await Board.findOneAndUpdate(
    { account: req.account._id, pinterestBoardId: String(created.id) },
    {
      name: created.name,
      description: created.description,
      privacy: created.privacy,
      lastSyncedAt: new Date(),
      deletedOnPinterest: false,
    },
    { upsert: true, new: true }
  );
  return ok(res, board, undefined, 201);
});

const update = asyncHandler(async (req, res) => {
  const board = await Board.findOne({ _id: req.params.boardId, account: req.account._id });
  if (!board) throw new AppError(404, 'NOT_FOUND', 'Board not found');
  const updated = await pinterestBoards.updateBoard(req.account, board.pinterestBoardId, req.body);
  board.name = updated.name ?? board.name;
  board.description = updated.description ?? board.description;
  board.privacy = updated.privacy ?? board.privacy;
  await board.save();
  return ok(res, board);
});

const remove = asyncHandler(async (req, res) => {
  if (req.query.confirm !== 'true') {
    throw new AppError(400, 'CONFIRM_REQUIRED', 'Pass confirm=true to delete a board');
  }
  const board = await Board.findOne({ _id: req.params.boardId, account: req.account._id });
  if (!board) throw new AppError(404, 'NOT_FOUND', 'Board not found');
  await pinterestBoards.deleteBoard(req.account, board.pinterestBoardId);
  board.deletedOnPinterest = true;
  await board.save();
  return ok(res, { success: true });
});

const createSection = asyncHandler(async (req, res) => {
  const board = await Board.findOne({ _id: req.params.boardId, account: req.account._id });
  if (!board) throw new AppError(404, 'NOT_FOUND', 'Board not found');
  const created = await pinterestBoards.createSection(req.account, board.pinterestBoardId, {
    name: req.body.name,
  });
  board.sections.push({ pinterestSectionId: created.id, name: created.name });
  await board.save();
  return ok(res, board, undefined, 201);
});

const updateSection = asyncHandler(async (req, res) => {
  const board = await Board.findOne({ _id: req.params.boardId, account: req.account._id });
  if (!board) throw new AppError(404, 'NOT_FOUND', 'Board not found');
  await pinterestBoards.updateSection(
    req.account,
    board.pinterestBoardId,
    req.params.sectionId,
    req.body
  );
  const section = board.sections.find((s) => s.pinterestSectionId === req.params.sectionId);
  if (section && req.body.name) section.name = req.body.name;
  await board.save();
  return ok(res, board);
});

const deleteSection = asyncHandler(async (req, res) => {
  const board = await Board.findOne({ _id: req.params.boardId, account: req.account._id });
  if (!board) throw new AppError(404, 'NOT_FOUND', 'Board not found');
  await pinterestBoards.deleteSection(req.account, board.pinterestBoardId, req.params.sectionId);
  board.sections = board.sections.filter((s) => s.pinterestSectionId !== req.params.sectionId);
  await board.save();
  return ok(res, board);
});

module.exports = { list, create, update, remove, createSection, updateSection, deleteSection };
