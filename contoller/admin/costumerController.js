const user = require('../../model/userSchema');

// List all non-admin users with optional search and pagination
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

    const userData = await user
      .find(searchQuery)
      .skip(skip)
      .limit(limit)
      .exec();

    const totalUsers = await user.countDocuments(searchQuery);

    res.render('users', {
      data: userData,
      totalPages: Math.ceil(totalUsers / limit),
      currentPage: page,
      search
    });

  } catch (error) {
    console.error('Error in customerinfo:', error);
    res.render('pageNotFound');
  }
};

// Block a costumer
const costumerBlocked = async (req, res) => {
  try {
    const id = req.query.id;
    await user.updateOne({ _id: id }, { $set: { isBlocked: true } });
    res.redirect('/admin/users');
  } catch (error) {
    console.error('Error in costumerBlocked:', error);
    res.render('pageNotFound');
  }
};

// Unblock a costumer
const costumerUnBlocked = async (req, res) => {
  try {
    const id = req.query.id;
    await user.updateOne({ _id: id }, { $set: { isBlocked: false } });
    res.redirect('/admin/users');
  } catch (error) {
    console.error('Error in costumerUnBlocked:', error);
    res.render('pageNotFound');
  }
};

// Clear search (just redirect to full user list)
const clearSearch = (req, res) => {
  try {
    res.redirect('/admin/users');
  } catch (error) {
    console.error('Error in clearSearch:', error);
    res.render('pageNotFound');
  }
};

module.exports = {
  customerinfo,
  costumerBlocked,
  costumerUnBlocked,
  clearSearch
};
