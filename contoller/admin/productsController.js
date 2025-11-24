const Product = require('../../model/productSchema');
const Category = require('../../model/categorySchema');
const Offers = require('../../model/offersSchema');
const fs = require('fs');
const path = require('path');
const { array } = require('../../middlewares/multer');
const cloudinary = require('../../config/cloudinary');

const productsinfo = async (req, res) => {
  try {
    return res.render('products');
  } catch (error) {
    console.error('Error in productsinfo:', error);
    res.redirect('/page-404');
  }
};

const getAddProductPage = async (req, res) => {
  try {
    const categories = await Category.find({ isListed: true });
    res.render('add-products', { cat: categories });
  } catch (error) {
    console.error('Error in getAddProductPage:', error);
    res.redirect('/page-404');
  }
};

const addProducts = async (req, res) => {
  try {
    const {
      productName,
      size,
      price,
      stock,
      description,
      category,
      croppedImage1,
      croppedImage2,
      croppedImage3
    } = req.body || {};

    const Colour = 'Default';

    if(/[^A-Za-z]g/.test(productName)){
      req.flash('msg', 'Product name should not contain special characters or numbers');
      return  res.redirect('/admin/addProducts');
    }

    if(productName.trim() == '' ){
      req.flash('msg', 'Product name cannot be empty');
      return  res.redirect('/admin/addProducts');
    }

    if (!productName || !size || !price || !stock || !description || !category ) {
      req.flash('msg', 'All fields are required');
      return res.redirect('/admin/addProducts');
    }

    const sizes = Array.isArray(size) ? size : [size];
    const prices = Array.isArray(price) ? price : [price];
    const stocks = Array.isArray(stock) ? stock : [stock];

    for (let i = 0; i < prices.length; i++) {
      if (parseFloat(prices[i]) < 0 || parseInt(stocks[i]) < 0) {
        req.flash('msg', 'Price and Stock cannot be negative');
        return res.redirect('/admin/addProducts');
      }
    }

    const existingProduct = await Product.findOne({ productName });
    if (existingProduct) {
      req.flash('msg', 'Product with this name already exists');
      return res.redirect('/admin/addProducts');
    }

    const categoryDoc = await Category.findOne({ categoryName: category });
    if (!categoryDoc) {
      req.flash('msg', 'Invalid category name');
      return res.redirect('/admin/addProducts');
    }

    const imagesBase64 = [croppedImage1, croppedImage2, croppedImage3];
    const imageFilenames = [];

    for (let i = 0; i < imagesBase64.length; i++) {
      const base64 = imagesBase64[i];
      if (!base64 || !base64.startsWith('data:image')) {
        req.flash('msg', 'Invalid or missing image data');
        return res.redirect('/admin/addProducts');
      }

      const result = await cloudinary.uploader.upload(base64, {
        folder: 'products',
        format: 'jpg',
        public_id: `product_${Date.now()}_${i}`
      });

      imageFilenames.push(result.secure_url);
    }

    const variants = [];
    for (let i = 0; i < sizes.length; i++) {
      const currentSize = sizes[i];
      const currentPrice = parseFloat(prices[i]);
      const currentStock = parseInt(stocks[i]);

      if (!currentSize || isNaN(currentPrice) || isNaN(currentStock)) {
        continue;
      }

      variants.push({
        Colour,
        Size: currentSize,
        Price: currentPrice,
        Stock: currentStock
      });
    }

    const newProduct = new Product({
      productName,
      Image: imageFilenames,
      Description: description,
      Category: categoryDoc._id,
      Variants: variants
    });

    await newProduct.save();
    res.redirect('/admin/products');
  } catch (error) {
    console.error('Error in addProducts:', error);
    res.status(500).render('page-404');
  }
};

const getAllProducts = async (req, res) => {
  try {
    const search = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 6;

    const regex = new RegExp(search, 'i');
    const filter = search
      ? { $or: [{ productName: regex }, { 'Category.categoryName': regex }] }
      : {};

    const products = await Product.find(filter)
      .populate('Category')
      .sort({UpdatedAt:-1})
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const now = new Date();
    const productsWithOffers = await Promise.all(products.map(async (product) => {
      const offer = await Offers.findOne({
        Product: product._id,
        Category: null,
        StartDate: { $lte: now },
        EndDate: { $gte: now }
      }).lean();
      const variant = product.Variants[0] || {};
      return {
        _id: product._id,
        name: product.productName,
        images: product.Image,
        category: product.Category?.categoryName || 'N/A',
        regularPrice: variant.Price || 0,
        salePrice: variant.OfferPrice || variant.Price || 0,
        stock: variant.Stock ?? 0,
        isAvailable: product.IsListed,
        offer: offer || null
      };
    }));

    const total = await Product.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    res.render('products', {
      products: productsWithOffers,
      currentPage: page,
      totalPages,
      search
    });
  } catch (error) {
    console.error('Error in getAllProducts:', error);
    res.redirect('/page-404');
  }
};

const unlist = async (req, res) => {
  try {
    const productId = req.params.productId;
    await Product.findByIdAndUpdate(productId, { IsListed: false });
    res.redirect('/admin/products');
  } catch (error) {
    console.error('Error in unlist:', error);
    res.redirect('/page-404');
  }
};

const list = async (req, res) => {
  try {
    const productId = req.params.productId;
    await Product.findByIdAndUpdate(productId, { IsListed: true });
    res.redirect('/admin/products');
  } catch (error) {
    console.error('Error in list:', error);
    res.redirect('/page-404');
  }
};

const getEditProductPage = async (req, res) => {
  try {
    const productId = req.params.productId;
    const products = await Product.find({isListed:true}).lean();
    const product = await Product.findById(productId).populate('Category').lean();
    const categories = await Category.find({ isListed: true }).lean();

    if (!product) return res.status(404).render('page-404');

    res.render('edit-product', { product, categories ,products });
  } catch (error) {
    console.error('Error in getEditProductPage:', error);
    res.redirect('/pageNotFound');
  }
};

const postEditProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const {
      productName,
      size,
      price,
      stock,
      description,
      category,
      croppedImage1,
      croppedImage2,
      croppedImage3
    } = req.body;

    const product = await Product.findById(productId);
    if (!product) return res.status(404).render('page-404');

    product.productName = productName;
    product.Description = description;

    const categoryDoc = await Category.findOne({ categoryName: category });
    if (!categoryDoc) return res.status(400).send('Invalid category');
    product.Category = categoryDoc._id;

    if (product.Variants.length === 0) product.Variants.push({});
    product.Variants[0].Size = size;
    product.Variants[0].Price = parseFloat(price);
    product.Variants[0].Stock = parseInt(stock);

    const newImages = [croppedImage1, croppedImage2, croppedImage3];
    const updatedImages = [];

    for (let i = 0; i < 3; i++) {
      const base64 = newImages[i];

      if (base64 && base64.startsWith('data:image')) {
        const uploadResult = await cloudinary.uploader.upload(base64, {
          folder: 'product-images'
        });
        updatedImages[i] = uploadResult.secure_url;
      } else {
        updatedImages[i] = product.Image[i] || '';
      }
    }

    product.Image = updatedImages;
    await product.save();

    res.redirect('/admin/products');
  } catch (error) {
    console.error('Error in postEditProduct:', error);
    res.status(500).render('page-404');
  }
};


module.exports = {
  productsinfo,
  getAddProductPage,
  addProducts,
  getAllProducts,
  unlist,
  list,
  getEditProductPage,
  postEditProduct
};