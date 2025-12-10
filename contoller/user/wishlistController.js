const Wishlist = require('../../model/wishlistSchema');
const Cart = require('../../model/cartSchema');
const Product = require('../../model/productSchema');
const User = require('../../model/userSchema');
const HttpStatus = require('../../config/httpStatus');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');

const getWishlist = catchAsync(async (req, res, next) => {
  const userId = req.session.user;
  if (!userId) {
    return res.redirect('/login');
  }
  const user = await User.findById(userId).lean();

  const wishlistItems = await Wishlist.find({ UserId: userId })
    .populate('ProductId')
    .lean();



  const formattedItems = wishlistItems.map(item => ({
    ...item,
    product: item.ProductId || { productName: 'Product Unavailable', Image: ['/images/default.jpg'], Variants: [{ Price: 0, Stock: 0 }] }
  }));

  res.render('wishlist', {
    wishlistItems: formattedItems,
    user,
    userId,
    activePage: 'wishlist',
    pageTitle: 'Wishlist'
  });
});


const addToCartFromWishlist = catchAsync(async (req, res, next) => {
  const { productId } = req.body;
  const userId = req.session.user;

  if (!userId || !productId) {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'User ID and Product ID are required' });
  }

  const product = await Product.findById(productId).lean();
  const variant = product?.Variants?.[0];

  if (!product || !variant || variant.Stock <= 0) {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Product is out of stock' });
  }

  let cart = await Cart.findOne({ user: userId });

  if (!cart) {
    cart = new Cart({ user: userId, Items: [] });
  }

  const existingItem = cart.Items.find(item => item.product.toString() === productId);

  if (existingItem) {
    if (existingItem.quantity >= 5) {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Maximum quantity limit reached (5)' });
    }

    if (existingItem.quantity + 1 > variant.Stock) {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Not enough stock available' });
    }

    existingItem.quantity += 1;

  } else {
    if (variant.Stock < 1) {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Product is out of stock' });
    }

    cart.Items.push({ product: productId, quantity: 1 });
  }

  await cart.save();

  await Wishlist.deleteOne({ UserId: userId, ProductId: productId });

  return res.status(HttpStatus.OK).json({ success: true, message: 'Product added to cart' });
});




const removeFromWishlist = catchAsync(async (req, res, next) => {
  const { wishlistId } = req.body;
  const userId = req.session.user;
  if (!userId || !wishlistId) {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'User ID and Wishlist ID are required' });
  }

  const deleted = await Wishlist.deleteOne({ _id: wishlistId, UserId: userId });
  if (deleted.deletedCount === 0) {
    return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: 'Wishlist item not found' });
  }



  res.status(HttpStatus.OK).json({ success: true, message: 'Product removed from wishlist' });
});




const addToWishlist = catchAsync(async (req, res, next) => {

  const userId = req.session.user;
  const { productId } = req.params;

  if (!userId) {
    return res.status(HttpStatus.UNAUTHORIZED).json({ error: 'LOGIN_REQUIRED' });
  }

  if (!productId) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: 'User ID and Product ID are required' });
  }

  const exists = await Wishlist.findOne({ UserId: userId, ProductId: productId });
  if (exists) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Product already in wishlist' });
  }

  const wishlistItem = new Wishlist({
    UserId: userId,
    ProductId: productId
  });

  await wishlistItem.save();

  res.status(HttpStatus.OK).json({ success: 'Product added to wishlist' });
});



module.exports = {
  getWishlist,
  addToCartFromWishlist,
  removeFromWishlist,
  addToWishlist
};