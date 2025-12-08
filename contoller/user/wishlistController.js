const Wishlist = require('../../model/wishlistSchema');
const Cart = require('../../model/cartSchema');
const Product = require('../../model/productSchema');
const User = require('../../model/userSchema');
const getWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId).lean();
    if (!userId) {
      return res.redirect('/login');
    }

    const wishlistItems = await Wishlist.find({ UserId: userId })
      .populate('ProductId')
      .lean();

    if (!wishlistItems || wishlistItems.length === 0) {
    }

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
  } catch (err) {
    console.error('Get wishlist error:', err);
    res.status(500).render('page-404');
  }
};


const addToCartFromWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.session.user;

    if (!userId || !productId) {
      return res.status(400).json({ success: false, message: 'User ID and Product ID are required' });
    }

    const product = await Product.findById(productId).lean();
    const variant = product?.Variants?.[0];

    if (!product || !variant || variant.Stock <= 0) {
      return res.status(400).json({ success: false, message: 'Product is out of stock' });
    }

    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      cart = new Cart({ user: userId, Items: [] });
    }

    const existingItem = cart.Items.find(item => item.product.toString() === productId);

    if (existingItem) {
      if (existingItem.quantity >= 5) {
        return res.status(400).json({ success: false, message: 'Maximum quantity limit reached (5)' });
      }

      if (existingItem.quantity + 1 > variant.Stock) {
        return res.status(400).json({ success: false, message: 'Not enough stock available' });
      }

      existingItem.quantity += 1;

    } else {
      if (variant.Stock < 1) {
        return res.status(400).json({ success: false, message: 'Product is out of stock' });
      }

      cart.Items.push({ product: productId, quantity: 1 });
    }

    await cart.save();

    await Wishlist.deleteOne({ UserId: userId, ProductId: productId });

    return res.json({ success: true, message: 'Product added to cart' });

  } catch (err) {
    console.error('Add to cart from wishlist error:', err);
    res.status(500).json({ success: false, message: 'Error adding product to cart' });
  }
};




const removeFromWishlist = async (req, res) => {
  try {
    const { wishlistId } = req.body;
    const userId = req.session.user;
    if (!userId || !wishlistId) {
      return res.status(400).json({ success: false, message: 'User ID and Wishlist ID are required' });
    }

    const deleted = await Wishlist.deleteOne({ _id: wishlistId, UserId: userId });
    if (deleted.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Wishlist item not found' });
    }



    res.json({ success: true, message: 'Product removed from wishlist' });
  } catch (err) {
    console.error('Remove from wishlist error:', err);
    res.status(500).json({ success: false, message: 'Error removing product from wishlist' });
  }
};




const addToWishlist = async (req, res) => {
  try {

    const userId = req.session.user;
    const { productId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'LOGIN_REQUIRED' });
    }

    if (!productId) {
      return res.status(400).json({ error: 'User ID and Product ID are required' });
    }

    const exists = await Wishlist.findOne({ UserId: userId, ProductId: productId });
    if (exists) {
      return res.status(400).json({ error: 'Product already in wishlist' });
    }

    const wishlistItem = new Wishlist({
      UserId: userId,
      ProductId: productId
    });

    await wishlistItem.save();

    res.json({ success: 'Product added to wishlist' });
  } catch (err) {
    console.error('Add to wishlist error:', err);
    res.status(500).json({ error: 'Error adding product to wishlist' });
  }
};



module.exports = {
  getWishlist,
  addToCartFromWishlist,
  removeFromWishlist,
  addToWishlist
};