const User = require('../../model/userSchema');
const category = require('../../model/categorySchema');
const Products = require('../../model/productSchema');
const Offers = require('../../model/offersSchema');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const Cart = require('../../model/cartSchema');
const Orders = require('../../model/ordersSchema');
const Address = require('../../model/addressSchema');
const Coupon = require('../../model/couponsSchema');
const Wishlist = require('../../model/wishlistSchema');
const Wallet = require('../../model/walletSchema');
const mongoose = require('mongoose');

const getProductOffer = async (product) => {
    try {
      if (!product || !product.Variants || !Array.isArray(product.Variants) || product.Variants.length === 0) {
        return { offer: null, salePrice: 0 };
      }
      const now = new Date();
      const variantPrice = product.Variants[0].Price || 0;
      const [productOffer, categoryOffer] = await Promise.all([
        Offers.findOne({
          Product: product._id,
          Category: null,
          StartDate: { $lte: now },
          EndDate: { $gte: now },
        }).lean(),
        Offers.findOne({
          Category: product.Category,
          Product: null,
          StartDate: { $lte: now },
          EndDate: { $gte: now },
        }).lean()
      ]);
      let offer = null;
      if (productOffer && categoryOffer) {
        offer = productOffer.Discount >= categoryOffer.Discount ? productOffer : categoryOffer;
      } else {
        offer = productOffer || categoryOffer;
      }
      if (!offer) {
        return { offer: null, salePrice: variantPrice };
      }
      const salePrice = variantPrice * (1 - offer.Discount / 100);
      return { offer, salePrice };
    } catch (err) {
      console.error(`Error fetching offer for productId: ${product?._id || 'unknown'}`, err);
      return { offer: null, salePrice: 0 };
    }
  };

const getProductDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId);
    const productId = req.params.id;
    const product = await Products.findById(productId).populate('Category').lean();
    console.log('product:',product);
    if (!product) return res.status(404).render('page-404');
    if (!product.Variants || !Array.isArray(product.Variants) || product.Variants.length === 0) {
      console.error(`Invalid Variants for product: ${product._id}`);
      return res.render('product-details', {
        product: {
          user,
          ...product,
          Variants: [{ Price: 0, salePrice: 0, Stock: 0, Size: '' }],
          offer: null
        },
        recommendedProducts: []
      });
    }
    const { offer, salePrice } = await getProductOffer(product);
    console.log('offer in product details :',offer);
    const formattedProduct = {
      ...product,
      Variants: product.Variants.map(variant => ({
        ...variant,
        salePrice: salePrice || variant.Price || 0
      })),
      offer
    };
    const recommendedProducts = await Products.find({
      _id: { $ne: productId },
      Category: product.Category._id,
      IsListed: true
    }).limit(4).lean();
    res.render('product-details', {
      activePage:'Shop',
      product: formattedProduct,
      recommendedProducts
    });
  } catch (error) {
    console.error('Error in getProductDetails:', error);
    res.status(500).render('page-404');
  }
};




const getShopPage = async (req, res) => {
  try {
    const limit = 6;
    const page = parseInt(req.query.page) || 1;
    const search = req.query.search || '';
    const sort = req.query.sort || '';
    const categoryId = req.query.category;
    const userId = req.session.user;
    const user = userId ? await User.findById(userId).lean() : null;
    const filter = { IsListed: true };
    if (search) {
      filter.productName = { $regex: search, $options: 'i' };
    }
    if (categoryId) {
      filter.Category = categoryId;
    }
    let sortOption = {};
    if (sort === 'name-asc') sortOption.productName = 1;
    else if (sort === 'name-desc') sortOption.productName = -1;
    else if (sort === 'price-asc') sortOption['Variants.0.Price'] = 1;
    else if (sort === 'price-desc') sortOption['Variants.0.Price'] = -1;
    const total = await Products.countDocuments(filter);
    const products = await Products.find(filter)
      .populate('Category')
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    const productsWithOffers = await Promise.all(products.map(async (product) => {
      if (!product.Variants || !Array.isArray(product.Variants) || product.Variants.length === 0) {
        console.error(`Invalid Variants for product: ${product._id}`);
        return {
          ...product,
          Variants: [{ Price: 0, salePrice: 0, Stock: 0 }],
          offer: null
        };
      }
      const { offer, salePrice } = await getProductOffer(product);
      const variant = product.Variants[0];
      return {
        ...product,
        Variants: [{
          Price: variant.Price || 0,
          salePrice: salePrice || variant.Price || 0,
          Stock: variant.Stock || 0
        }],
        offer
      };
    }));
    const categories = await category.find();
    res.render('shop-page', {
      products: productsWithOffers,
      categories,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      categoryId,
      search,
      sort,
      user,
      activePage: 'shopnow'
    });
  } catch (err) {
    console.error('Shop page error:', err);
    res.status(500).send('Something went wrong');
  }
};





module.exports ={
    getProductDetails,
    getShopPage,
    getProductOffer

};