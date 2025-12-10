const User = require('../../model/userSchema');
const mongoose = require('mongoose')
const HttpStatus = require('../../config/httpStatus');


const customerinfo = async (req, res) => {
  try {
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

  } catch (error) {
    console.error('Error in customerinfo:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('page-404');
  }
};



const costumerBlocked = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Invalid user ID' });
    }
    const user = await User.findById(id);
    if (!user) {
      return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: 'User not found' });
    }
    if (user.isBlocked) {
      console.log(`User already blocked: ${id}`);
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'User is already blocked' });
    }
    const result = await User.updateOne({ _id: id }, { $set: { isBlocked: true } });
    if (result.modifiedCount === 0) {
      console.log(`Failed to block user: ${id}`);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to block user' });
    }
    res.status(HttpStatus.OK).json({ success: true, message: 'User blocked successfully' });
  } catch (error) {
    console.error(`Error in costumerBlocked for ID: ${req.body.id}`, error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error blocking user' });
  }
};

const costumerUnBlocked = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      console.log(`Invalid ObjectId: ${id}`);
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Invalid user ID' });
    }
    const user = await User.findById(id);
    if (!user) {
      console.log(`User not found for ID: ${id}`);
      return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: 'User not found' });
    }
    if (!user.isBlocked) {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'User is already unblocked' });
    }
    const result = await User.updateOne({ _id: id }, { $set: { isBlocked: false } });
    if (result.modifiedCount === 0) {
      console.log(`Failed to unblock user: ${id}`);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to unblock user' });
    }
    res.status(HttpStatus.OK).json({ success: true, message: 'User unblocked successfully' });
  } catch (error) {
    console.error(`Error in costumerUnBlocked for ID: ${req.body.id}`, error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error unblocking user' });
  }
};


const clearSearch = (req, res) => {
  try {
    res.redirect('/admin/users');
  } catch (error) {
    console.error('Error in clearSearch:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('page-404');
  }
};

module.exports = {
  customerinfo,
  costumerBlocked,
  costumerUnBlocked,
  clearSearch
};
