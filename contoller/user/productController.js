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

/**
 * Get active offer (product/category) for THIS product
 * and compute sale price for the GIVEN variant.
 */
const getProductOffer = async (product, variant) => {
  try {
    if (
      !product ||
      !product.Variants ||
      !Array.isArray(product.Variants) ||
      product.Variants.length === 0
    ) {
      return { offer: null, salePrice: 0 };
    }

    // Use the passed variant; fallback to first variant if missing
    const baseVariant = variant || product.Variants[0];
    const variantPrice = baseVariant?.Price || 0;

    const now = new Date();

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
      offer = productOffer.Discount >= categoryOffer.Discount
        ? productOffer
        : categoryOffer;
    } else {
      offer = productOffer || categoryOffer;
    }

    if (!offer) {
      // no active offer – salePrice is just variantPrice
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
    const user = userId ? await User.findById(userId).lean() : null;

    const productId = req.params.id;
    const product = await Products.findById(productId)
      .populate('Category')
      .lean();

    if (!product) return res.status(404).render('page-404');

    // No variants → safe fallback
    if (!product.Variants || !Array.isArray(product.Variants) || product.Variants.length === 0) {
      return res.render('product-details', {
        activePage: 'shopnow',
        user,
        product: {
          ...product,
          Variants: [{ Price: 0, salePrice: 0, Stock: 0, Size: '' }],
          offer: null
        },
        recommendedProducts: []
      });
    }

    // Get offer once (offer is same for all variants, only base price changes)
    const { offer } = await getProductOffer(product, product.Variants[0]);

    const formattedProduct = {
      ...product,
      Variants: product.Variants.map(variant => {
        const basePrice = variant.Price || 0;
        const salePrice = offer
          ? basePrice * (1 - offer.Discount / 100)
          : basePrice;

        return {
          ...variant,
          salePrice
        };
      }),
      offer
    };

    // Recommended products (same category, excluding current)
    const recommendedProducts = await Products.find({
      _id: { $ne: productId },
      Category: product.Category?._id,
      IsListed: true
    })
      .limit(4)
      .lean();

    res.render('product-details', {
      activePage: 'shopnow',
      user,
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
    const search = req.query.search?.trim() || '';
    const sort = req.query.sort || '';
    const categoryId = req.query.category;
    const userId = req.session.user;

    const user = userId ? await User.findById(userId).lean() : null;

    // Base match: only listed products
    let matchStage = { IsListed: true };

    if (search) {
      matchStage.productName = { $regex: search, $options: 'i' };
    }

    if (categoryId) {
      matchStage.Category = new mongoose.Types.ObjectId(categoryId);
    }

    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'categories',
          localField: 'Category',
          foreignField: '_id',
          as: 'categoryData'
        }
      },
      {
        $match: {
          $and: [
            { 'categoryData.0': { $exists: true } },
            { 'categoryData.0.isListed': true }
          ]
        }
      },
      {
        $addFields: {
          Category: { $arrayElemAt: ['$categoryData', 0] }
        }
      },
      { $sort: getSortOption(sort) },
      { $skip: (page - 1) * limit },
      { $limit: limit }
    ];

    const [products, totalDocs] = await Promise.all([
      Products.aggregate(pipeline).exec(),
      Products.aggregate([
        { $match: matchStage },
        {
          $lookup: {
            from: 'categories',
            localField: 'Category',
            foreignField: '_id',
            as: 'cat'
          }
        },
        { $match: { 'cat.0.isListed': true } },
        { $count: 'total' }
      ]).then(r => r[0]?.total || 0)
    ]);

    // Attach offer + salePrice based on FIRST variant (card view)
    const productsWithOffers = await Promise.all(
      products.map(async (product) => {
        if (!product.Variants || !product.Variants.length) {
          return {
            ...product,
            Variants: [{ Price: 0, salePrice: 0, Stock: 0 }],
            offer: null
          };
        }

        const firstVariant = product.Variants[0];
        const { offer, salePrice } = await getProductOffer(product, firstVariant);

        return {
          ...product,
          Variants: [{
            ...firstVariant,
            Price: firstVariant.Price || 0,
            salePrice: salePrice ?? firstVariant.Price ?? 0,
            Stock: firstVariant.Stock || 0
          }],
          offer
        };
      })
    );

    const categories = await category.find({ isListed: true }).lean();

    res.render('shop-page', {
      products: productsWithOffers,
      categories,
      currentPage: page,
      totalPages: Math.ceil(totalDocs / limit),
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

function getSortOption(sort) {
  switch (sort) {
    case 'name-asc':
      return { productName: 1 };
    case 'name-desc':
      return { productName: -1 };
    case 'price-asc':
      return { 'Variants.0.Price': 1 };
    case 'price-desc':
      return { 'Variants.0.Price': -1 };
    default:
      return { CreatedDate: -1 };
  }
}

module.exports = {
  getProductDetails,
  getShopPage,
  getProductOffer
};
