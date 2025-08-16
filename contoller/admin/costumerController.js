const User = require('../../model/userSchema');
const mongoose = require('mongoose')


const customerinfo = async (req, res) => {
  try {
    const search = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
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
    res.render('page-404');
  }
};



const costumerBlocked = async (req, res) => {
  try {
    console.log(`Reached costumerBlocked endpoint for URL: ${req.originalUrl}, body: ${JSON.stringify(req.body)}`);
    const { id } = req.body;
    console.log(`Blocking user with ID: ${id}`);
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      console.log(`Invalid ObjectId: ${id}`);
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }
    const user = await User.findById(id);
    if (!user) {
      console.log(`User not found for ID: ${id}`);
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (user.isBlocked) {
      console.log(`User already blocked: ${id}`);
      return res.status(400).json({ success: false, message: 'User is already blocked' });
    }
    const result = await User.updateOne({ _id: id }, { $set: { isBlocked: true } });
    if (result.modifiedCount === 0) {
      console.log(`Failed to block user: ${id}`);
      return res.status(500).json({ success: false, message: 'Failed to block user' });
    }
    console.log(`User blocked successfully: ${id}`);
    res.json({ success: true, message: 'User blocked successfully' });
  } catch (error) {
    console.error(`Error in costumerBlocked for ID: ${req.body.id}`, error);
    res.status(500).json({ success: false, message: 'Error blocking user' });
  }
};

const costumerUnBlocked = async (req, res) => {
  try {
    console.log(`Reached costumerUnBlocked endpoint for URL: ${req.originalUrl}, body: ${JSON.stringify(req.body)}`);
    const { id } = req.body;
    console.log(`Unblocking user with ID: ${id}`);
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      console.log(`Invalid ObjectId: ${id}`);
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }
    const user = await User.findById(id);
    if (!user) {
      console.log(`User not found for ID: ${id}`);
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    console.log(`User isBlocked status: ${user.isBlocked}`);
    if (!user.isBlocked) {
      console.log(`User already unblocked: ${id}`);
      return res.status(400).json({ success: false, message: 'User is already unblocked' });
    }
    const result = await User.updateOne({ _id: id }, { $set: { isBlocked: false } });
    if (result.modifiedCount === 0) {
      console.log(`Failed to unblock user: ${id}`);
      return res.status(500).json({ success: false, message: 'Failed to unblock user' });
    }
    console.log(`User unblocked successfully: ${id}`);
    res.json({ success: true, message: 'User unblocked successfully' });
  } catch (error) {
    console.error(`Error in costumerUnBlocked for ID: ${req.body.id}`, error);
    res.status(500).json({ success: false, message: 'Error unblocking user' });
  }
};


const clearSearch = (req, res) => {
  try {
    res.redirect('/admin/users');
  } catch (error) {
    console.error('Error in clearSearch:', error);
    res.render('page-404');
  }
};

module.exports = {
  customerinfo,
  costumerBlocked,
  costumerUnBlocked,
  clearSearch
};
