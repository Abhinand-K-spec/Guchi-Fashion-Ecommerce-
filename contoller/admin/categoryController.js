const Category = require('../../model/categorySchema');
const Offers = require('../../model/offersSchema');

const categoryinfo = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 3;
    const skip = (page - 1) * limit;
    const now = new Date(); // Current date: July 24, 2025, 9:57 PM IST

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
  } catch (error) {
    console.log('Error in categoryinfo:', error);
    res.render('page-404');
  }
};

const addCategory = async (req, res) => {
  const { name, description } = req.body;
  try {
    const existingCategory = await Category.findOne({
      categoryName: { $regex: `^${name}$`, $options: 'i' }
    });

    if (existingCategory) {
      return res.status(400).json({ error: 'Category already exists' });
    }

    const newCategory = new Category({
      categoryName: name,
      description,
      isListed: true
    });

    await newCategory.save();
    return res.json({ message: 'Category added successfully' });
  } catch (error) {
    console.log('Error in addCategory:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const unlist = async (req, res) => {
  try {
    const categoryId = req.query.id;
    const category = await Category.findByIdAndUpdate(categoryId, { isListed: false });
    if (!category) {
      return res.render('page-404');
    }
    res.redirect(`/admin/category?page=${req.query.page || 1}`);
  } catch (error) {
    console.error('Error unlisting category:', error);
    res.render('page-404');
  }
};

const list = async (req, res) => {
  try {
    const categoryId = req.query.id;
    const category = await Category.findByIdAndUpdate(categoryId, { isListed: true });
    if (!category) {
      return res.render('page-404');
    }
    res.redirect(`/admin/category?page=${req.query.page || 1}`);
  } catch (error) {
    console.error('Error listing category:', error);
    res.render('page-404');
  }
};

const getEditCategory = async (req, res) => {
  try {
    const id = req.params.id;
    const categoryData = await Category.findById(id);

    if (!categoryData) {
      return res.render('page-404');
    }

    res.render('edit-category', { category: categoryData });
  } catch (error) {
    console.log('Error in getEditCategory:', error);
    res.render('page-404');
  }
};

const editCategory = async (req, res) => {
  try {
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
      res.status(404).render('page-404');
    }
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).render('page-404');
  }
};

const searchCategory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const now = new Date(); // Current date: July 24, 2025, 9:57 PM IST

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
      console.log(`Category ${cat.categoryName} (_id: ${cat._id}) offer:`, offer); // Debugging
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
  } catch (error) {
    console.error('Error in searchCategory:', error);
    res.render('page-404');
  }
};

const clearSearch = async (req, res) => {
  try {
    res.redirect('/admin/category');
  } catch (error) {
    console.error('Error in clearSearch:', error);
    res.render('page-404');
  }
};

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