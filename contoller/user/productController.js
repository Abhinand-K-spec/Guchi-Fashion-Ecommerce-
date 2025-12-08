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

const getProductOffer = async (product, variantIndex = 0) => {
  try {
    if (!product || !product.Variants || !Array.isArray(product.Variants) || product.Variants.length === 0) {
      return { offer: null, salePrice: 0 };
    }
    const now = new Date();
    const validVariantIndex = Math.max(0, Math.min(variantIndex, product.Variants.length - 1));
    const variantPrice = product.Variants[validVariantIndex].Price || 0;
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
    if (!product) return res.status(404).render('page-404');
    if (!product.Variants || !Array.isArray(product.Variants) || product.Variants.length === 0) {
      return res.render('product-details', {
        product: {
          user,
          ...product,
          Variants: [{ Price: 0, salePrice: 0, Stock: 0, Size: '' }],
          offer: null,
          activePage: 'shopnow'
        },
        recommendedProducts: []
      });
    }
    const { offer } = await getProductOffer(product, 0);

    const formattedProduct = {
      ...product,
      Variants: product.Variants.map(variant => {
        const variantPrice = variant.Price || 0;
        let salePrice = variantPrice;
        if (offer) {
          salePrice = variantPrice * (1 - offer.Discount / 100);
        }
        return {
          ...variant,
          salePrice: salePrice
        };
      }),
      offer
    };
    const recommendedProducts = await Products.find({
      _id: { $ne: productId },
      Category: product.Category._id,
      IsListed: true
    }).limit(4).lean();
    res.render('product-details', {
      activePage: 'shopnow',
      product: formattedProduct,
      recommendedProducts,
      user
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
    const minPrice = req.query.minPrice;
    const maxPrice = req.query.maxPrice;
    const userId = req.session.user;

    const user = userId ? await User.findById(userId).lean() : null;


    let matchStage = { IsListed: true };


    if (search) {
      matchStage.productName = { $regex: search, $options: 'i' };
    }


    if (categoryId) {
      matchStage.Category = new mongoose.Types.ObjectId(categoryId);
    }

    if (minPrice || maxPrice) {
      matchStage['Variants.0.Price'] = {};
      const min = parseFloat(minPrice);
      const max = parseFloat(maxPrice);
      if (!isNaN(min)) matchStage['Variants.0.Price'].$gte = min;
      if (!isNaN(max)) matchStage['Variants.0.Price'].$lte = max;
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
        { $lookup: { from: 'categories', localField: 'Category', foreignField: '_id', as: 'cat' } },
        { $match: { 'cat.0.isListed': true } },
        { $count: 'total' }
      ]).then(res => res[0]?.total || 0)
    ]);


    const productsWithOffers = await Promise.all(
      products.map(async (product) => {
        if (!product.Variants?.length) {
          return { ...product, Variants: [{ Price: 0, salePrice: 0, Stock: 0 }], offer: null };
        }

        const { offer, salePrice } = await getProductOffer(product, 0);
        const variant = product.Variants[0];

        return {
          ...product,
          Variants: [{
            Price: variant.Price || 0,
            salePrice: salePrice ?? variant.Price ?? 0,
            Stock: variant.Stock || 0
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
      minPrice,
      maxPrice,
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
    case 'name-asc': return { productName: 1 };
    case 'name-desc': return { productName: -1 };
    case 'price-asc': return { 'Variants.0.Price': 1 };
    case 'price-desc': return { 'Variants.0.Price': -1 };
    default: return { CreatedDate: -1 };
  }
}





module.exports = {
  getProductDetails,
  getShopPage,
  getProductOffer

};