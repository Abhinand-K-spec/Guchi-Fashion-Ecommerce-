const User = require('../../model/userSchema');
const mongoose = require('mongoose')
const HttpStatus = require('../../config/httpStatus');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');

const customerinfo = catchAsync(async (req, res) => {
  const search = req.query.search || '';
  const page = parseInt(req.query.page) || 1;
  const limit = 8;
  const skip = (page - 1) * limit;

  const searchQuery = {
    isAdmin: false,
    $or: [
      { name: { $regex: new RegExp(search, 'i') } },
      { email: { $regex: new RegExp(search, 'i') } }
    ]
  };

  const userData = await User
    .find(searchQuery)
    .skip(skip)
    .limit(limit)
    .exec();

  const totalUsers = await User.countDocuments(searchQuery);

  res.render('users', {
    data: userData,
    totalPages: Math.ceil(totalUsers / limit),
    currentPage: page,
    search
  });
});

const costumerBlocked = catchAsync(async (req, res, next) => {
  const { id } = req.body;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Invalid user ID' });
  }
  const user = await User.findById(id);
  if (!user) {
    return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: 'User not found' });
  }
  if (user.isBlocked) {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'User is already blocked' });
  }
  const result = await User.updateOne({ _id: id }, { $set: { isBlocked: true } });
  if (result.modifiedCount === 0) {
    return next(new AppError('Failed to block user', HttpStatus.INTERNAL_SERVER_ERROR));
  }
  res.status(HttpStatus.OK).json({ success: true, message: 'User blocked successfully' });
});

const costumerUnBlocked = catchAsync(async (req, res, next) => {
  const { id } = req.body;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Invalid user ID' });
  }
  const user = await User.findById(id);
  if (!user) {
    return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: 'User not found' });
  }
  if (!user.isBlocked) {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'User is already unblocked' });
  }
  const result = await User.updateOne({ _id: id }, { $set: { isBlocked: false } });
  if (result.modifiedCount === 0) {
    return next(new AppError('Failed to unblock user', HttpStatus.INTERNAL_SERVER_ERROR));
  }
  res.status(HttpStatus.OK).json({ success: true, message: 'User unblocked successfully' });
});

const clearSearch = catchAsync(async (req, res) => {
  res.redirect('/admin/users');
});

module.exports = {
  customerinfo,
  costumerBlocked,
  costumerUnBlocked,
  clearSearch
};
