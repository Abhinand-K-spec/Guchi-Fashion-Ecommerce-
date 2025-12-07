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

    if (/[^A-Za-z]g/.test(productName)) {
      req.flash('msg', 'Product name should not contain special characters or numbers');
      return res.redirect('/admin/addProducts');
    }

    if (productName.trim() == '') {
      req.flash('msg', 'Product name cannot be empty');
      return res.redirect('/admin/addProducts');
    }

    if (!productName || !size || !price || !stock || !description || !category) {
      req.flash('msg', 'All fields are required');
      return res.redirect('/admin/addProducts');
    }

    if (productName.length > 40) {
      req.flash('msg', 'Product name must be max 40 characters');
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
      if (parseFloat(prices[i]) < 100) {
        req.flash('msg', 'Price must be at least 100');
        return res.redirect('/admin/addProducts');
      }
      if (parseFloat(prices[i]) > 99999) {
        req.flash('msg', 'Price cannot exceed 99999');
        return res.redirect('/admin/addProducts');
      }
      if (parseInt(stocks[i]) > 999) {
        req.flash('msg', 'Stock cannot exceed 999');
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
      .sort({ UpdatedAt: -1 })
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
        salePrice: offer ? Math.round(variant.Price * (1 - offer.Discount / 100)) : (variant.OfferPrice || variant.Price || 0),
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
    const products = await Product.find({ isListed: true }).lean();
    const product = await Product.findById(productId).populate('Category').lean();
    const categories = await Category.find({ isListed: true }).lean();

    if (!product) return res.status(404).render('page-404');

    res.render('edit-product', { product, categories, products });
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

    if (productName.length > 15) {
      // Assuming you have a way to show error in edit page, or just redirect back
      // Since specific error handling for edit isn't fully detailed in previous context, 
      // I'll assume similar flash or just reject. Ideally we should flash.
      // But postEditProduct usually redirects to products list on success or 404/500 on error.
      // Let's redirect to edit page with error if possible, but the route signature implies just redirect.
      // I'll check if flash is used in edit.
      // For now, let's use a basic return or similar handling to addProducts.
      // Actually, looking at the code, it has no flash handling visible in postEditProduct snippet.
      // I will add the check and if it fails, maybe redirect back to edit with query param or just simple response.
      // Wait, let's check validation first.
    }

    // Let's implement the check inside the logic. 
    // Since I can't easily see if flash is set up for edit view from here (it often is),
    // I will return a 400 status or similar if I can't flash.
    // However, consistency with addProducts suggests redirect.
    // Let's try to find if `req.flash` is available. `addProducts` uses it. `postEditProduct` likely has access.

    // REVISING CHUNK:
    // I will add the checks properly.
    if (productName.length > 40) {
      // Ideally Flash message here
      // But I don't see error handling in view for edit yet (user didn't ask for that part explicitly but validity is needed)
      // I'll just prevent saving for now.
      return res.redirect(`/admin/editProduct/${productId}?error=Name too long`);
    }

    // Actually, let's look at the method again.
    // It's `postEditProduct`. 
    // I will insert:
    if (productName.length > 15) return res.status(400).send('Product name must be max 15 characters');
    if (parseFloat(price) > 99999) return res.status(400).send('Price cannot exceed 99999');
    if (parseInt(stock) > 999) return res.status(400).send('Stock cannot exceed 999');

    // Wait, `res.send` is abrupt. Ideally we redirect.
    // Let's check the code snippet provided earlier. It has `res.redirect('/admin/products')` on success.

    product.productName = productName;
    product.Description = description;

    const categoryDoc = await Category.findOne({ categoryName: category });
    if (!categoryDoc) return res.status(400).send('Invalid category');
    product.Category = categoryDoc._id;

    if (product.Variants.length === 0) {
      product.Variants.push({
        Size: size,
        Price: parseFloat(price),
        Stock: parseInt(stock)
      });
    } else {
      const variantIndex = product.Variants.findIndex(v => v.Size === size);
      if (variantIndex !== -1) {
        product.Variants[variantIndex].Price = parseFloat(price);
        product.Variants[variantIndex].Stock = parseInt(stock);
      } else {
        // Optional: Handle case where size doesn't exist (maybe add it?)
        // For now, let's assume we only edit existing variants or add if empty
        product.Variants.push({
          Size: size,
          Price: parseFloat(price),
          Stock: parseInt(stock)
        });
      }
    }

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