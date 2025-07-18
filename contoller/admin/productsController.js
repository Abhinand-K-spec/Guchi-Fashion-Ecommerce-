const Product = require('../../model/productSchema');
const Category = require('../../model/categorySchema');
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
    console.log(req.body);

    // Validation
    if (!productName || !size || !price || !stock || !description || !category) {
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

    // Upload images to Cloudinary
    const imagesBase64 = [croppedImage1, croppedImage2, croppedImage3];
    const imageUrls = [];

    for (let i = 0; i < imagesBase64.length; i++) {
      const base64 = imagesBase64[i];
      if (!base64 || !base64.startsWith('data:image')) {
        req.flash('msg', 'Invalid or missing image data');
        return res.redirect('/admin/addProducts');
      }

      const uploadResponse = await cloudinary.uploader.upload(base64, {
        folder: 'guchi-products'
      });

      imageUrls.push(uploadResponse.secure_url);
    }

    // Build variants array
    const variants = [];
    for (let i = 0; i < sizes.length; i++) {
      const currentSize = sizes[i];
      const currentPrice = parseFloat(prices[i]);
      const currentStock = parseInt(stocks[i]);

      if (!currentSize || isNaN(currentPrice) || isNaN(currentStock)) continue;

      variants.push({
        Colour,
        Size: currentSize,
        Price: currentPrice,
        Stock: currentStock
      });
    }

    const newProduct = new Product({
      productName,
      Image: imageUrls, // use Cloudinary image URLs
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
      ? { $or: [{ productName: regex }, { Brand: regex }] }
      : {};

    const total = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .populate('Category')
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    

    const formattedProducts = products.map(p => {
      const variant = p.Variants[0] || {};
      return {
        _id: p._id,
        name: p.productName,
        images: p.Image,
        category: p.Category?.categoryName || 'N/A',
        regularPrice: variant.Price || 0,
        salePrice: variant.OfferPrice || variant.Price || 0,
        stock: variant.Stock ?? 0,
        isAvailable: p.IsListed
      };
    });



    res.render('products', {
      products: formattedProducts,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      search,
      
      
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
    const product = await Product.findById(productId).populate('Category').lean();
    const categories = await Category.find({ isListed: true }).lean();

    if (!product) return res.status(404).render('page-404');

    res.render('edit-product', { product, categories });
  } catch (error) {
    console.error('Error in getEditProductPage:', error);
    res.redirect('/page-404');
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
    const imageDir = path.join(__dirname, '../../public/uploads/product-images');
    if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });

    const updatedImages = [];


    
    for (let i = 0; i < 3; i++) {
      const base64 = newImages[i];

      if (base64 && base64.startsWith('data:image')) {
        if (product.Image[i]) {
          const oldPath = path.join(imageDir, product.Image[i]);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        const base64Data = base64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
        const filename = `product_${Date.now()}_${i}.jpg`;
        const filePath = path.join(imageDir, filename);
        fs.writeFileSync(filePath, base64Data, 'base64');
        updatedImages[i] = filename;
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
