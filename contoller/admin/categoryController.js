const Category = require('../../model/categorySchema');
const Offers = require('../../model/offersSchema');
const HttpStatus = require('../../config/httpStatus');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');

const categoryinfo = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 3;
  const skip = (page - 1) * limit;
  const now = new Date();

  const categorydata = await Category
    .find({})
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();


  const categoriesWithOffers = await Promise.all(categorydata.map(async (cat) => {
    const offer = await Offers.findOne({
      Category: cat._id,
      StartDate: { $lte: now },
      EndDate: { $gte: now }
    }).lean();

    return { ...cat, offer: offer || null };
  }));

  const totalcategories = await Category.countDocuments();
  const totalpages = Math.ceil(totalcategories / limit);

  res.render('category', {
    currentPage: page,
    cat: categoriesWithOffers,
    totalCategories: totalcategories,
    totalPages: totalpages
  });
});

const addCategory = catchAsync(async (req, res, next) => {
  const { name, description } = req.body;
  const existingCategory = await Category.findOne({
    categoryName: { $regex: `^${name}$`, $options: 'i' }
  });

  if (existingCategory) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Category already exists' });
  }

  const newCategory = new Category({
    categoryName: name,
    description,
    isListed: true
  });

  await newCategory.save();
  return res.status(HttpStatus.OK).json({ message: 'Category added successfully' });
});

const unlist = catchAsync(async (req, res, next) => {
  const categoryId = req.query.id;
  const category = await Category.findByIdAndUpdate(categoryId, { isListed: false });
  if (!category) {
    return next(new AppError('Category not found', HttpStatus.NOT_FOUND));
  }
  res.redirect(`/admin/category?page=${req.query.page || 1}`);
});

const list = catchAsync(async (req, res, next) => {
  const categoryId = req.query.id;
  const category = await Category.findByIdAndUpdate(categoryId, { isListed: true });
  if (!category) {
    return next(new AppError('Category not found', HttpStatus.NOT_FOUND));
  }
  res.redirect(`/admin/category?page=${req.query.page || 1}`);
});

const getEditCategory = catchAsync(async (req, res, next) => {
  const id = req.params.id;
  const categoryData = await Category.findById(id);

  if (!categoryData) {
    return next(new AppError('Category not found', HttpStatus.NOT_FOUND));
  }

  res.render('edit-category', { category: categoryData });
});

const editCategory = catchAsync(async (req, res, next) => {
  const id = req.params.id;
  const { categoryName, description } = req.body;

  const existingCategory = await Category.findOne({
    categoryName: categoryName,
    _id: { $ne: id }
  });

  if (existingCategory) {
    return res.render('edit-category', {
      category: { _id: id, categoryName, description },
      error: 'Category with this name already exists.'
    });
  }

  const updatedCategory = await Category.findByIdAndUpdate(
    id,
    { categoryName, description },
    { new: true }
  );

  if (updatedCategory) {
    res.redirect(`/admin/category?page=${req.query.page || 1}`);
  } else {
    return next(new AppError('Category not found', HttpStatus.NOT_FOUND));
  }
});

const searchCategory = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 4;
  const skip = (page - 1) * limit;
  const search = req.query.search || '';
  const now = new Date();

  const query = {
    categoryName: { $regex: new RegExp(search, 'i') }
  };

  const categorydata = await Category
    .find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const categoriesWithOffers = await Promise.all(categorydata.map(async (cat) => {
    const offer = await Offers.findOne({
      Category: cat._id,
      StartDate: { $lte: now },
      EndDate: { $gte: now }
    }).lean();
    return { ...cat, offer: offer || null };
  }));

  const totalcategories = await Category.countDocuments(query);
  const totalpages = Math.ceil(totalcategories / limit);

  res.render('category', {
    currentPage: page,
    cat: categoriesWithOffers,
    totalCategories: totalcategories,
    totalPages: totalpages,
    search
  });
});

const clearSearch = catchAsync(async (req, res) => {
  res.redirect('/admin/category');
});

module.exports = {
  categoryinfo,
  addCategory,
  unlist,
  list,
  getEditCategory,
  editCategory,
  searchCategory,
  clearSearch
};