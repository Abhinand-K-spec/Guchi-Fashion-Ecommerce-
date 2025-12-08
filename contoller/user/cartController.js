const Cart = require('../../model/cartSchema');
const User = require('../../model/userSchema');
const Products = require('../../model/productSchema');
const Address = require('../../model/addressSchema');
const Orders = require('../../model/ordersSchema');
const Coupon = require('../../model/couponsSchema');
const Offers = require('../../model/offersSchema');
const Wallet = require('../../model/walletSchema');
const mongoose = require('mongoose');



const getProductOffer = async (product, variantIndex = 0) => {
  try {
    if (!product || !product.Variants || !Array.isArray(product.Variants) || product.Variants.length === 0) {
      console.error(`Invalid product data: ${JSON.stringify(product)}`);
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


const cart = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId).lean();

    const cartData = await Cart.findOne({ user: userId })
      .populate({
        path: 'Items.product',
        populate: { path: 'Category' }
      })
      .lean();

    if (!cartData || !cartData.Items.length) {
      return res.render('cart', {
        cartItems: [],
        totalPrice: 0,
        user,
        activePage: 'cart'
      });
    }

    let totalPrice = 0;
    const cartItems = [];
    const validItems = [];
    for (const item of cartData.Items) {
      const product = item.product;
      if (!product || !product.productName) {
        cartItems.push({
          _id: '',
          name: 'Unnamed Product',
          image: 'images/default.jpg',
          price: 0,
          quantity: item.quantity,
          stock: 0,
          itemTotal: 0
        });
        continue;
      }

      const variantIndex = item.variantIndex !== undefined ? item.variantIndex : 0;
      const variant = product.Variants?.[variantIndex];
      const { offer, salePrice } = await getProductOffer(product, variantIndex);
      const price = salePrice || variant?.Price || 0;
      const quantity = item.quantity;
      const itemTotal = price * quantity;

      let imagePath = 'images/default.jpg';
      if (variant?.Image?.length) {
        const raw = variant.Image[0];
        imagePath = raw.startsWith('http') ? raw : `${raw}`;
      } else if (product.Image?.length) {
        const raw = product.Image[0];
        imagePath = raw.startsWith('http') ? raw : `${raw}`;
      }

      const isProductListed = product.IsListed;
      const isCategoryListed = product.Category && product.Category.isListed;

      cartItems.push({
        _id: product._id,
        name: product.productName,
        image: imagePath,
        price,
        quantity,
        stock: variant?.Stock || 0,
        itemTotal,
        offer: offer ? offer.Discount : null,
        variantIndex: variantIndex,
        isListed: isProductListed && isCategoryListed,
        size: variant?.Size || '',
        originalPrice: variant?.Price || 0
      });

      if (variant?.Stock >= item.quantity && isProductListed && isCategoryListed) {
        totalPrice += itemTotal;
        validItems.push(item);
      }
    }

    await Cart.updateOne(
      { user: userId },
      { $set: { Items: validItems } }
    );

    res.render('cart', {
      cartItems,
      totalPrice,
      user,
      activePage: 'cart'
    });
  } catch (error) {
    console.error('Error rendering cart page:', error);
    res.status(500).render('page-404');
  }
};



const getCartData = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {return res.json({ success: false, message: 'User not logged in' });}

    const cartData = await Cart.findOne({ user: userId })
      .populate({
        path: 'Items.product',
        populate: { path: 'Category' }
      })
      .lean();

    if (!cartData || !cartData.Items.length) {
      return res.json({ success: true, cartItems: [], totalPrice: 0 });
    }

    let totalPrice = 0;
    const cartItems = await Promise.all(cartData.Items.map(async item => {
      const product = item.product;
      const variantIndex = item.variantIndex !== undefined ? item.variantIndex : 0;
      const variant = product?.Variants?.[variantIndex];

      const { offer, salePrice } = await getProductOffer(product, variantIndex);
      const price = salePrice || variant?.Price || 0;

      const quantity = item.quantity;
      const itemTotal = price * quantity;

      const isProductListed = product.IsListed;
      const isCategoryListed = product.Category && product.Category.isListed;

      if (variant?.Stock >= item.quantity && isProductListed && isCategoryListed) {
        totalPrice += itemTotal;
      }

      let imagePath = 'images/default.jpg';
      if (variant?.Image?.length) {
        const raw = variant.Image[0];
        imagePath = raw.startsWith('http') ? raw : `${raw}`;
      } else if (product.Image?.length) {
        const raw = product.Image[0];
        imagePath = raw.startsWith('http') ? raw : `${raw}`;
      }

      return {
        _id: product._id,
        name: product.productName,
        image: imagePath,
        price,
        quantity,
        stock: variant?.Stock || 0,
        itemTotal,
        variantIndex: variantIndex,
        itemTotal,
        variantIndex: variantIndex,
        isListed: isProductListed && isCategoryListed,
        size: variant?.Size || '',
        originalPrice: variant?.Price || 0,
        offer: offer ? offer.Discount : null
      };
    }));

    res.json({ success: true, cartItems, totalPrice });
  } catch (err) {
    console.error('Get cart data error:', err);
    res.json({ success: false, message: 'Error fetching cart data' });
  }
};

const addToCart = async (req, res) => {
  try {

    const userId = req.session.user;
    const productId = req.params.productId;
    const { variantIndex = 0 } = req.body;

    if (!req.session.user) {
      return res.status(401).json({ error: "LOGIN_REQUIRED" });
    }

    const product = await Products.findById(productId);
    if (!product) {return res.redirect('/shop');}

    const validVariantIndex = Math.max(0, Math.min(variantIndex, (product.Variants?.length || 1) - 1));
    const selectedVariant = product.Variants[validVariantIndex];

    if (!selectedVariant || selectedVariant.Stock <= 0) {
      return res.status(400).json({ error: 'This product variant is currently out of stock' });
    }

    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      cart = new Cart({ user: userId, Items: [] });
    }

    const index = cart.Items.findIndex(item =>
      item.product.toString() === productId && item.variantIndex === validVariantIndex
    );

    if (index >= 0) {
      if (cart.Items[index].quantity >= 5) {
        return res.status(400).json({ error: 'You cannot add more than 5 items of this product.' });
      } else if (cart.Items[index].quantity >= selectedVariant.Stock) {
        return res.status(400).json({ error: 'Not enough stock available' });
      } else {
        cart.Items[index].quantity += 1;
      }
    } else {
      cart.Items.push({ product: productId, quantity: 1, variantIndex: validVariantIndex });
    }

    await cart.save();
    return res.json({ success: 'Successfully added to cart' })
  } catch (err) {
    console.error('Add to cart error:', err);
    res.redirect('/shop');
  }
};

const updateCartQuantity = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.id;
    const { action, variantIndex } = req.body;

    if (!userId || !productId || !action) {
      return res.json({ success: false, message: 'Invalid request data.' });
    }

    const cart = await Cart.findOne({ user: userId })
      .populate({
        path: 'Items.product',
        populate: { path: 'Category' }
      });

    if (!cart) {
      return res.json({ success: false, message: 'Cart not found.' });
    }

    const item = cart.Items.find(i =>
      String(i.product._id) === String(productId) &&
      (variantIndex !== undefined ? i.variantIndex === Number(variantIndex) : true)
    );

    if (!item) {
      return res.json({ success: false, message: 'Item not found in cart.' });
    }

    if (action === 'increment') {
      const itemVariantIndex = item.variantIndex !== undefined ? item.variantIndex : 0;
      const stock = item.product?.Variants?.[itemVariantIndex]?.Stock || 0;
      const isProductListed = item.product.IsListed;
      const isCategoryListed = item.product.Category && item.product.Category.isListed;

      if (!isProductListed || !isCategoryListed) {
        return res.json({ success: false, message: 'This item is currently unavailable.' });
      }

      if (item.quantity >= 5) {
        return res.json({ success: false, message: 'You cannot add more than 5 items.' });
      }
      if (item.quantity >= stock) {
        return res.json({ success: false, message: `Only ${stock} items are available.` });
      }

      item.quantity += 1;
    } else if (action === 'decrement') {
      if (item.quantity <= 1) {
        return res.json({ success: false, message: 'Quantity cannot be less than 1.' });
      }
      item.quantity -= 1;
    } else {
      return res.json({ success: false, message: 'Invalid action.' });
    }

    if (action === 'increment') {
      const itemVariantIndex = item.variantIndex !== undefined ? item.variantIndex : 0;
      const stock = item.product?.Variants?.[itemVariantIndex]?.Stock || 0;

      if (item.quantity > 5) {
        item.quantity = 5;
      }
      if (item.quantity > stock) {
        item.quantity = stock;
      }
    } else if (action === 'decrement') {
      if (item.quantity < 1) {
        item.quantity = 1;
      }
    }

    await cart.save();

    let totalPrice = 0;
    const cartItems = await Promise.all(cart.Items.map(async item => {
      const product = item.product;
      const variantIndex = item.variantIndex !== undefined ? item.variantIndex : 0;
      const variant = product?.Variants?.[variantIndex];


      const { offer, salePrice } = await getProductOffer(product, variantIndex);
      const price = salePrice || variant?.Price || 0;

      const quantity = item.quantity;
      const itemTotal = price * quantity;

      const isProductListed = product.IsListed;
      const isCategoryListed = product.Category && product.Category.isListed;

      if (variant?.Stock >= item.quantity && isProductListed && isCategoryListed) {
        totalPrice += itemTotal;
      }

      let imagePath = 'images/default.jpg';
      if (variant?.Image?.length) {
        const raw = variant.Image[0];
        imagePath = raw.startsWith('http') ? raw : `${raw}`;
      } else if (product.Image?.length) {
        const raw = product.Image[0];
        imagePath = raw.startsWith('http') ? raw : `${raw}`;
      }

      return {
        _id: product._id,
        name: product.productName,
        image: imagePath,
        price,
        quantity,
        stock: variant?.Stock || 0,
        itemTotal,
        variantIndex: variantIndex,
        isListed: isProductListed && isCategoryListed
      };
    }));

    res.json({ success: true, cartItems, totalPrice });
  } catch (err) {
    console.error('Update quantity error:', err);
    res.json({ success: false, message: 'Error updating quantity' });
  }
};

const removeFromCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.id;
    const { variantIndex } = req.body;

    if (!userId) {
      return res.json({ success: false, message: 'User not logged in' });
    }

    if (variantIndex === undefined) {
      return res.json({ success: false, message: 'Variant index missing.' });
    }

    const result = await Cart.findOneAndUpdate(
      { user: userId },
      { $pull: { Items: { product: productId, variantIndex: Number(variantIndex) } } },
      { new: true }
    ).lean();

    if (!result) {
      return res.json({ success: false, message: 'Cart not found or item already removed.' });
    }

    return res.json({ success: true, message: 'Variant successfully removed from cart.' });

  } catch (err) {
    console.error('Remove cart error:', err);
    return res.json({ success: false, message: 'Error removing item from cart' });
  }
};



const checkout = async (req, res) => {
  try {

    const userId = req.session.user;
    const user = await User.findById(userId).lean();
    const addresses = await Address.find({ userId }).lean();
    const cartData = await Cart.findOne({ user: userId })
      .populate({
        path: 'Items.product',
        populate: { path: 'Category' }
      })
      .lean();
    if (!cartData || !cartData.Items.length) {
      return res.redirect('/cart');
    }


    const coupons = await Coupon.find({
      StartDate: { $lte: new Date() },
      ExpiryDate: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      IsListed: true,
      $or: [{ UserId: null }, { UserId: new mongoose.Types.ObjectId(userId) }]
    }).lean();


    const wallet = await Wallet.findOne({ UserId: userId }).lean() || { Balance: 0 };

    let subtotal = 0;
    let totalItemDiscount = 0;
    const cartItems = [];
    const validCartItems = [];
    for (const item of cartData.Items) {
      const product = item.product;
      const variantIndex = item.variantIndex !== undefined ? item.variantIndex : 0;
      const variant = product?.Variants?.[variantIndex];
      if (!product || !variant || !product._id || !product.Category) {
        console.error(`Invalid cart item: productId=${item.product?._id || 'missing'}`);
        continue;
      }
      const { offer, salePrice } = await getProductOffer(product, variantIndex);
      const price = salePrice || variant.Price || 0;
      const originalPrice = variant.Price || 0;
      const quantity = item.quantity;
      const itemTotal = price * quantity;
      const itemDiscount = (originalPrice - price) * quantity;

      let imagePath = 'public/uploads/product-images/default.jpg';
      if (variant.Image?.length) {
        imagePath = variant.Image[0];
      } else if (product.Image?.[0]) {
        imagePath = product.Image[0];
      }

      const isProductListed = product.IsListed;
      const isCategoryListed = product.Category && product.Category.isListed;

      if (!isProductListed || !isCategoryListed) {
        continue;
      }

      cartItems.push({
        _id: product._id,
        name: product.productName,
        image: imagePath,
        price,
        originalPrice,
        itemDiscount,
        offer,
        quantity,
        itemTotal,
        stock: variant.Stock || 0,
        variantIndex: variantIndex
      });
      if (variant.Stock >= item.quantity) {
        subtotal += itemTotal;
        totalItemDiscount += itemDiscount;
        validCartItems.push(item);
      }
    }
    if (!cartItems.length) {
      return res.redirect('/cart');
    }
    await Cart.findOneAndUpdate(
      { user: userId },
      { $set: { Items: validCartItems } }
    );
    const tax = (subtotal * 0.05) / 100;
    const discount = 0;
    const deliveryCharge = 40;
    const finalTotal = subtotal - discount + tax + deliveryCharge;

    res.render('checkout', {
      pageTitle: 'Checkout',
      cartItems,
      subtotal,
      totalItemDiscount,
      discount,
      tax,
      deliveryCharge,
      finalTotal,
      addresses,
      coupons,
      user,
      wallet,
      activePage: 'checkout',
      userId,
      RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).render('page-404');
  }
};






module.exports = {
  cart,
  getCartData,
  addToCart,
  removeFromCart,
  updateCartQuantity,
  checkout
};