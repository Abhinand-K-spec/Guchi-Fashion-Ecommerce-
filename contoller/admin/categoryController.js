const category = require('../../model/categorySchema');
const { findByIdAndUpdate } = require('../../model/userSchema');

const categoryinfo = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 3;
    const skip = (page - 1) * limit;

    const categorydata = await category
      .find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalcategories = await category.countDocuments();
    const totalpages = Math.ceil(totalcategories / limit);

    res.render('category', {
      currentPage: page,
      cat: categorydata,
      totalCategories: totalcategories,
      totalPages: totalpages
    });
  } catch (error) {
    console.log('Error in categoryinfo:', error);
    res.render('pageNotFound');
  }
};

const addCategory = async (req, res) => {
  const { name, description } = req.body;
  try {
    const existingCategory = await category.findOne({
      name: { $regex: `^${name}$`, $options: 'i' }
    });

    if (existingCategory) {
      return res.status(400).json({ error: 'Category already exists' });
    }

    const newCategory = new category({
      categoryName : name,
      description,
      isListed: true
    });

    await newCategory.save();
    return res.json({ message: 'Category added successfully' });
  } catch (error) {
    console.log('Error in addCategory:', error);
    res.status(500).send('Internal server error');
  }
};


const unlist = async (req, res) => {
    try {
      const categoryId = req.query.id;
      await category.findByIdAndUpdate(categoryId, { isListed: false });
      res.redirect('/admin/category');
    } catch (error) {
      console.error('Error unlisting category:', error);
      res.redirect('/admin/pageNotFound');
    }
  };



  const list = async (req, res) => {
    try {
      const categoryId = req.query.id;
      await category.findByIdAndUpdate(categoryId, { isListed: true });
      res.redirect('/admin/category');
    } catch (error) {
      console.error('Error listing category:', error);
      res.redirect('/admin/pageNotFound');
    }
  };
  


  const getEditCategory = async (req, res) => {
    try {
      const id = req.params.id;
      const categoryData = await category.findById(id);  // Corrected model usage
  
      if (!categoryData) {
        return res.render('page-404');
      }
  
      res.render('edit-category', { category: categoryData });  // Pass actual data to EJS
    } catch (error) {
      console.log('Error in getEditCategory:', error);
      res.render('page-404');
    }
  };
  



  const editCategory = async (req, res) => {
    try {
      const id = req.params.id;
      const { categoryName, description } = req.body;
  
      // Check for existing category with the same name (but not the current one)
      const existingCategory = await category.findOne({
        categoryName: categoryName,
        _id: { $ne: id }
      });
  
      if (existingCategory) {
        // Render the edit page again with an error
        return res.render('edit-category', {
          category: { _id: id, categoryName, description },
          error: 'Category with this name already exists.'
        });
      }
  
      // Update the category
      const updatedCategory = await category.findByIdAndUpdate(
        id,
        { categoryName, description },
        { new: true }
      );
  
      if (updatedCategory) {
        res.redirect('/admin/category');
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
  
      const query = {
        categoryName: { $regex: new RegExp(search, 'i') }
      };
  
      const categorydata = await category
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
  
      const totalcategories = await category.countDocuments(query);
      const totalpages = Math.ceil(totalcategories / limit);
  
      res.render('category', {
        currentPage: page,
        cat: categorydata,
        totalCategories: totalcategories,
        totalPages: totalpages,
        search
      });
    } catch (error) {
      console.error('Error in searchCategory:', error);
      res.render('pageNotFound');
    }
  };



  const clearSearch = async(req,res)=>{
    try {
         res.redirect('/admin/category')
    } catch (error) {
        res.render('page-404')
    }
  }
  
  







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
