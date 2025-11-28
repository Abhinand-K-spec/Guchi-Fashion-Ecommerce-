const Cart = require('../../model/cartSchema');
const User = require('../../model/userSchema');
const Products = require('../../model/productSchema');
const Address = require('../../model/addressSchema');
const Orders = require('../../model/ordersSchema');
const Coupon = require('../../model/couponsSchema');
const Offers = require('../../model/offersSchema');
const Wallet = require('../../model/walletSchema');
const mongoose = require('mongoose');



const getProductOffer = async (product, variant) => {
  try {
    if (!variant) return { offer: null, salePrice: 0 };

    const now = new Date();
    const variantPrice = variant.Price || 0;

    const [productOffer, categoryOffer] = await Promise.all([
      Offers.findOne({
        Product: product._id,
        Category: null,
        StartDate: { $lte: now },
        EndDate: { $gte: now }
      }).lean(),
      Offers.findOne({
        Category: product.Category,
        Product: null,
        StartDate: { $lte: now },
        EndDate: { $gte: now }
      }).lean()
    ]);

    let offer = null;
    if (productOffer && categoryOffer) {
      offer = productOffer.Discount >= categoryOffer.Discount ? productOffer : categoryOffer;
    } else {
      offer = productOffer || categoryOffer;
    }

    if (!offer) return { offer: null, salePrice: variantPrice };

    const salePrice = variantPrice * (1 - offer.Discount / 100);
    return { offer, salePrice };
  } catch (err) {
    console.error("Offer error:", err);
    return { offer: null, salePrice: 0 };
  }
};


const cart = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId).lean();

    const cartData = await Cart.findOne({ user: userId })
      .populate('Items.product')
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
      const size = item.size;

      const variant = product.Variants.find(v => v.Size === size);

      if (!product || !variant) continue;

      const { offer, salePrice } = await getProductOffer(product, variant);

      const price = salePrice || variant.Price;
      const itemTotal = price * item.quantity;

      cartItems.push({
        _id: product._id,
        size,
        name: product.productName,
        image: product.Image[0],
        price,
        quantity: item.quantity,
        stock: variant.Stock,
        itemTotal,
        offer: offer ? offer.Discount : null
      });

      if (variant.Stock >= item.quantity) {
        validItems.push(item);
        totalPrice += itemTotal;
      }
    }

    // Remove invalid items
    await Cart.updateOne({ user: userId }, { $set: { Items: validItems } });

    res.render('cart', {
      cartItems,
      totalPrice,
      user,
      activePage: 'cart'
    });
  } catch (err) {
    console.error("Cart render error:", err);
    res.status(500).render('page-404');
  }
};



// ======================================================
// 🟦 API - Get Cart Data
// ======================================================
const getCartData = async (req, res) => {
  try {
    const userId = req.session.user;

    const cartData = await Cart.findOne({ user: userId }).populate('Items.product').lean();
    if (!cartData || !cartData.Items.length)
      return res.json({ success: true, cartItems: [], totalPrice: 0 });

    let totalPrice = 0;

    const cartItems = cartData.Items.map(item => {
      const product = item.product;
      const variant = product.Variants.find(v => v.Size === item.size);

      if (!product || !variant) return null;

      const price = variant.Price;
      const itemTotal = price * item.quantity;

      if (variant.Stock >= item.quantity) totalPrice += itemTotal;

      return {
        _id: product._id,
        name: product.productName,
        size: item.size,
        image: product.Image[0],
        price,
        quantity: item.quantity,
        stock: variant.Stock,
        itemTotal
      };
    }).filter(Boolean);

    res.json({ success: true, cartItems, totalPrice });
  } catch (err) {
    console.error("Cart API error:", err);
    res.json({ success: false, message: "Error fetching cart data" });
  }
};



// ======================================================
// 🟩 ADD TO CART (MULTI-SIZE SUPPORT)
// ======================================================
const addToCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.productId;
    const size = req.body.size;

    if (!size) return res.status(400).json({ error: "Please select a size" });

    const product = await Products.findById(productId).lean();
    if (!product) return res.status(400).json({ error: "Product not found" });

    const variant = product.Variants.find(v => v.Size === size);
    if (!variant) return res.status(400).json({ error: "Invalid size selected" });

    if (variant.Stock <= 0) return res.status(400).json({ error: "This size is out of stock" });

    let cart = await Cart.findOne({ user: userId });
    if (!cart) cart = new Cart({ user: userId, Items: [] });

    // Check SAME product AND SAME size
    const index = cart.Items.findIndex(item =>
      item.product.toString() === productId && item.size === size
    );

    if (index >= 0) {
      if (cart.Items[index].quantity < 5 && cart.Items[index].quantity < variant.Stock) {
        cart.Items[index].quantity += 1;
      } else {
        return res.status(400).json({ error: "Not enough stock" });
      }
    } else {
      cart.Items.push({
        product: productId,
        size,
        quantity: 1
      });
    }

    await cart.save();
    return res.json({ success: "Successfully added to cart" });

  } catch (err) {
    console.error("Add to cart error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};



// ======================================================
// 🟧 UPDATE QUANTITY (MULTI-SIZE SUPPORT)
// ======================================================
const updateCartQuantity = async (req, res) => {
  try {
    const userId = req.session.user;
    const { id: productId } = req.params;
    const { action, size } = req.body;

    const cart = await Cart.findOne({ user: userId }).populate('Items.product');
    if (!cart) return res.json({ success: false, message: "Cart not found" });

    const item = cart.Items.find(i =>
      String(i.product._id) === String(productId) && i.size === size
    );

    if (!item) return res.json({ success: false, message: "Item not found" });

    const variant = item.product.Variants.find(v => v.Size === size);
    if (!variant) return res.json({ success: false, message: "Invalid size variant" });

    if (action === "increment") {
      if (item.quantity >= 5) return res.json({ success: false, message: "Max quantity is 5" });
      if (item.quantity >= variant.Stock) return res.json({ success: false, message: `Only ${variant.Stock} available` });
      item.quantity += 1;
    }

    if (action === "decrement") {
      if (item.quantity <= 1) return res.json({ success: false, message: "Min quantity is 1" });
      item.quantity -= 1;
    }

    await cart.save();

    // Recalculate totals
    let totalPrice = 0;
    const cartItems = cart.Items.map(i => {
      const vp = i.product.Variants.find(v => v.Size === i.size);
      const price = vp.Price;
      const itemTotal = price * i.quantity;
      totalPrice += itemTotal;

      return {
        _id: i.product._id,
        name: i.product.productName,
        size: i.size,
        image: i.product.Image[0],
        price,
        quantity: i.quantity,
        stock: vp.Stock,
        itemTotal
      };
    });

    return res.json({ success: true, cartItems, totalPrice });

  } catch (err) {
    console.error("Update quantity error:", err);
    res.json({ success: false, message: "Error updating quantity" });
  }
};



// ======================================================
// ❌ REMOVE FROM CART (NOW REMOVES PRODUCT + SIZE ONLY)
// ======================================================
const removeFromCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.id;
    const { size } = req.body;

    const result = await Cart.findOneAndUpdate(
      { user: userId },
      { $pull: { Items: { product: productId, size } } },
      { new: true }
    ).lean();

    if (!result) return res.json({ success: false, message: "Item not found" });

    return res.json({ success: true, message: "Item removed" });
  } catch (err) {
    console.error("Remove cart error:", err);
    res.json({ success: false, message: "Error removing item" });
  }
};



// ======================================================
// 🟨 CHECKOUT — PROPER PER-VARIANT PRICING
// ======================================================
const checkout = async (req, res) => {
  try {
    const userId = req.session.user;

    const user = await User.findById(userId).lean();
    const addresses = await Address.find({ userId }).lean();
    const cartData = await Cart.findOne({ user: userId }).populate('Items.product').lean();

    if (!cartData || !cartData.Items.length) return res.redirect('/cart');

    const coupons = await Coupon.find({
      StartDate: { $lte: new Date() },
      ExpiryDate: { $gte: new Date() },
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
      const variant = product.Variants.find(v => v.Size === item.size);

      if (!variant) continue;

      const { offer, salePrice } = await getProductOffer(product, variant);

      const price = salePrice || variant.Price;
      const itemTotal = price * item.quantity;
      const itemDiscount = (variant.Price - price) * item.quantity;

      cartItems.push({
        _id: product._id,
        size: item.size,
        name: product.productName,
        image: product.Image[0],
        price,
        originalPrice: variant.Price,
        offer,
        itemDiscount,
        quantity: item.quantity,
        itemTotal,
        stock: variant.Stock
      });

      if (variant.Stock >= item.quantity) {
        subtotal += itemTotal;
        totalItemDiscount += itemDiscount;
        validCartItems.push(item);
      }
    }

    await Cart.updateOne({ user: userId }, { $set: { Items: validCartItems } });

    const tax = (subtotal * 0.05) / 100;
    const deliveryCharge = 40;
    const discount = 0;

    const finalTotal = subtotal - discount + tax + deliveryCharge;

    res.render('checkout', {
      pageTitle: "Checkout",
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
      activePage: "checkout",
      userId,
      RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID
    });

  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).render('page-404');
  }
};



// EXPORT
module.exports = {
  cart,
  getCartData,
  addToCart,
  removeFromCart,
  updateCartQuantity,
  checkout
};
