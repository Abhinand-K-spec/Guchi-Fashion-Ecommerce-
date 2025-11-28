const Wishlist = require('../../model/wishlistSchema');
const Cart = require('../../model/cartSchema');
const Product = require('../../model/productSchema');


// ======================
// ✅ GET WISHLIST
// ======================
const getWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect('/login');

    const wishlistItems = await Wishlist.find({ UserId: userId })
      .populate('ProductId')
      .lean();

    const formattedItems = wishlistItems.map(item => ({
      ...item,
      product: item.ProductId || {
        productName: 'Product Unavailable',
        Image: ['/images/default.jpg'],
        Variants: [{ Price: 0, Stock: 0 }]
      }
    }));

    res.render('wishlist', {
      wishlistItems: formattedItems,
      userId,
      activePage: 'wishlist',
      pageTitle: 'Wishlist'
    });

  } catch (err) {
    console.error('Get wishlist error:', err);
    res.status(500).render('page-404');
  }
};


// ======================
// ⭐ ADD TO CART FROM WISHLIST (Variant Aware)
// ======================
const addToCartFromWishlist = async (req, res) => {
  try {
    const { productId, size } = req.body;
    const userId = req.session.user;

    if (!userId || !productId) {
      return res.status(400).json({ success: false, message: 'User ID and Product ID are required' });
    }

    if (!size) {
      return res.status(400).json({ success: false, message: 'Please select a size before adding to cart' });
    }

    const product = await Product.findById(productId).lean();
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const variant = product.Variants.find(v => v.Size === size);
    if (!variant || variant.Stock <= 0) {
      return res.status(400).json({ success: false, message: 'Selected size is out of stock' });
    }

    let cart = await Cart.findOne({ user: userId });
    if (!cart) cart = new Cart({ user: userId, Items: [] });

    // Check SAME product + SAME size
    const existingItem = cart.Items.find(
      item => item.product.toString() === productId && item.size === size
    );

    if (existingItem) {
      if (existingItem.quantity >= 5)
        return res.status(400).json({ success: false, message: 'You cannot add more than 5 items' });

      if (existingItem.quantity + 1 > variant.Stock)
        return res.status(400).json({ success: false, message: `Only ${variant.Stock} items available` });

      existingItem.quantity += 1;

    } else {
      cart.Items.push({
        product: productId,
        size,
        quantity: 1
      });
    }

    await cart.save();

    // Remove that wishlist entry
    await Wishlist.deleteOne({ UserId: userId, ProductId: productId });

    return res.json({ success: true, message: 'Product added to cart' });

  } catch (err) {
    console.error('Add to cart from wishlist error:', err);
    res.status(500).json({ success: false, message: 'Error adding product to cart' });
  }
};


// ======================
// ❌ REMOVE FROM WISHLIST
// ======================
const removeFromWishlist = async (req, res) => {
  try {
    const { wishlistId } = req.body;
    const userId = req.session.user;

    if (!userId || !wishlistId) {
      return res.status(400).json({ success: false, message: 'Invalid request' });
    }

    const deleted = await Wishlist.deleteOne({ _id: wishlistId, UserId: userId });

    if (deleted.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Wishlist item not found' });
    }

    res.json({ success: true, message: 'Product removed from wishlist' });

  } catch (err) {
    console.error('Remove wishlist error:', err);
    res.status(500).json({ success: false, message: 'Error removing item' });
  }
};


// ======================
// ⭐ ADD TO WISHLIST (Variant Aware)
// ======================
const addToWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId, size } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    if (!size) {
      return res.status(400).json({ error: 'Size is required to add product to wishlist' });
    }

    const exists = await Wishlist.findOne({ UserId: userId, ProductId: productId, Size: size });

    if (exists) {
      return res.status(400).json({ error: 'This size of product is already in wishlist' });
    }

    const newItem = new Wishlist({
      UserId: userId,
      ProductId: productId,
      Size: size
    });

    await newItem.save();

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
