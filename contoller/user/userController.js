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
const Razorpay = require('razorpay');
const crypto = require('crypto');
require('dotenv').config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

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
        $or: [{ MinPrice: { $exists: false } }, { MinPrice: { $lte: variantPrice } }],
        $or: [{ MaxPrice: { $exists: false } }, { MaxPrice: { $gte: variantPrice } }]
      }).lean(),
      Offers.findOne({
        Category: product.Category,
        Product: null,
        StartDate: { $lte: now },
        EndDate: { $gte: now },
        $or: [{ MinPrice: { $exists: false } }, { MinPrice: { $lte: variantPrice } }],
        $or: [{ MaxPrice: { $exists: false } }, { MaxPrice: { $gte: variantPrice } }]
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

const pageNotFound = async (req, res) => {
  try {
    return res.render('page-404');
  } catch (error) {
    res.redirect('/pageNotFound');
  }
};

const googleCallbackHandler = async (req, res) => {
  if (req.user.isBlocked) {
    req.logout(() => {
      req.flash('msg', 'User is blocked by admin') || null;
      res.redirect('/signup');
    });
  } else {
    req.session.user = req.user._id;
    res.redirect('/');
  }
};

const getForgotPasswordPage = (req, res) => {
  res.render('forgot-password', { msg: '' });
};

const handleForgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    console.log(`Password reset link should be sent to: ${email}`);
    res.render('forgot-password', { msg: 'If the email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.render('forgot-password', { msg: 'An error occurred. Try again later.' });
  }
};

const loadHomePage = async (req, res) => {
  try {
    const userId = req.session.user;
    const categories = await category.find({ isListed: true });
    const categoryIds = categories.map(cat => cat._id);
    const allProducts = await Products.find({
      IsListed: true,
      Category: { $in: categoryIds },
    }).populate('Category').sort({ CreatedDate: -1 }).lean();
    const productsWithOffers = await Promise.all(allProducts.map(async (product) => {
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
    const featuredProducts = productsWithOffers.slice(0, 4);
    const userData = userId ? await User.findById(userId).lean() : null;
    res.render('home', {
      user: userData,
      products: productsWithOffers,
      featuredProducts,
      activePage: 'home'
    });
  } catch (error) {
    console.log('Home page error:', error);
    res.json({ 'error': 'Server error' });
  }
};

const logout = async (req, res) => {
  return req.session.destroy((err) => {
    if (err) {
      console.log('error occurred', err);
      res.render('pageNotFound');
    } else {
      res.redirect('/login');
    }
  });
};

const loadSignup = async (req, res) => {
  try {
    return res.render('signup');
  } catch (err) {
    console.log('error occurred');
    res.json({ 'error': 'Server error' });
  }
};

const loadLogin = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.render('login');
    } else {
      res.redirect('/');
    }
  } catch (error) {
    res.redirect('/pageNotFound');
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const findUser = await User.findOne({ isAdmin: 0, email: email });
    if (!findUser) {
      return res.render('login', { msg: 'User not found' });
    }
    if (findUser.isBlocked) {
      return res.render('login', { msg: 'User is blocked by admin' });
    }
    const passwordmatch = await bcrypt.compare(password, findUser.password);
    if (!passwordmatch) {
      return res.render('login', { msg: `Password didn't match` });
    }
    req.session.user = findUser._id;
    res.redirect('/');
  } catch (error) {
    console.log('error occurred while login', error);
    res.render('login', { msg: 'Login failed please try again' });
  }
};

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerification(email, otp) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMIALER_GMAIL,
        pass: process.env.NODEMAILER_PASSWORD
      }
    });
    const info = await transporter.sendMail({
      from: process.env.NODEMIALER_GMAIL,
      to: email,
      subject: 'Verify your account',
      text: `Your OTP is ${otp}`,
      html: `<b>Your OTP: ${otp} </b>`
    });
    return info.accepted.length > 0;
  } catch (error) {
    console.error('error sending otp', error);
    return false;
  }
}

const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const findUser = await User.findOne({ email });
    console.log('Email in signup:', email);
    if (findUser) {
      return res.render('signup', { msg: 'User already exists' });
    }
    const otp = generateOtp();
    console.log('Generated OTP:', otp);
    const emailSend = await sendVerification(email, otp);
    if (!emailSend) {
      return res.json({ 'error': 'email-error' });
    }
    req.session.otp = otp;
    req.session.userData = { name, email, password };
    res.render('verify-otp');
    console.log('OTP sent:', otp);
  } catch (error) {
    console.error('Error signing up:', error);
    res.render('page-404');
  }
};

const securePassword = async (password) => {
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    return passwordHash;
  } catch (error) {
    console.error('Error hashing password:', error);
    throw new Error('Password hashing failed');
  }
};

const verifyOtp = async (req, res) => {
  try {
    console.log("BODY:", req.body);
    console.log("SESSION:", req.session);
    const userOtp = req.body.otp?.trim();
    if (!userOtp || !/^\d{6}$/.test(userOtp)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 6-digit OTP.' });
    }
    if (!req.session.userData || !req.session.otp) {
      return res.status(400).json({ success: false, message: 'Session expired. Please sign up again.' });
    }
    if (userOtp === req.session.otp) {
      const user = req.session.userData;
      const passwordhash = await securePassword(user.password);
      const saveUserData = new User({
        name: user.name,
        email: user.email,
        password: passwordhash
      });
      await saveUserData.save();
      req.session.user = saveUserData._id;
      delete req.session.otp;
      delete req.session.userData;
      return res.status(200).json({ success: true, message: 'OTP verified successfully.', redirect: '/login' });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
    }
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return res.status(500).json({ success: false, message: 'An error occurred while verifying OTP. Please try again.' });
  }
};

const resendOtp = async (req, res) => {
  try {
    const email = req.session.userData?.email;
    if (!email) return res.redirect('/signup');
    const newOtp = generateOtp();
    req.session.otp = newOtp;
    const emailSend = await sendVerification(email, newOtp);
    if (!emailSend) {
      return res.render('verify-otp', { msg: 'Failed to resend OTP. Try again later.' });
    }
    console.log("New OTP:", newOtp);
    return res.render('verify-otp', { msg: 'New OTP has been sent to your email.' });
  } catch (err) {
    console.log('Resend OTP Error:', err);
    return res.redirect('/signup');
  }
};

const getProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Products.findById(productId).populate('Category').lean();
    if (!product) return res.status(404).render('page-404');
    if (!product.Variants || !Array.isArray(product.Variants) || product.Variants.length === 0) {
      console.error(`Invalid Variants for product: ${product._id}`);
      return res.render('product-details', {
        product: {
          ...product,
          Variants: [{ Price: 0, salePrice: 0, Stock: 0, Size: '' }],
          offer: null
        },
        recommendedProducts: []
      });
    }
    const { offer, salePrice } = await getProductOffer(product);
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

const checkout = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId).lean();
    const addresses = await Address.find({ userId }).lean();
    const cartData = await Cart.findOne({ user: userId }).populate('Items.product').lean();
    if (!cartData || !cartData.Items.length) {
      return res.redirect('/cart');
    }
    const coupons = await Coupon.find({
      StartDate: { $lte: new Date() },
      ExpiryDate: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      IsListed: true,
      $or: [{ UserId: null }, { UserId: userId }]
    }).lean();
    const wallet = await Wallet.findOne({ userId }).lean() || { balance: 0 };
    let subtotal = 0;
    let totalItemDiscount = 0;
    const cartItems = [];
    const validCartItems = [];
    for (const item of cartData.Items) {
      const product = item.product;
      const variant = product?.Variants?.[0];
      if (!product || !variant || !product._id || !product.Category) {
        console.error(`Invalid cart item: productId=${item.product?._id || 'missing'}`);
        continue;
      }
      const { offer, salePrice } = await getProductOffer(product);
      const price = salePrice || variant.Price || 0;
      const originalPrice = variant.Price || 0;
      const quantity = item.quantity;
      const itemTotal = price * quantity;
      const itemDiscount = (originalPrice - price) * quantity;
      cartItems.push({
        _id: product._id,
        name: product.productName,
        image: product.Image[0] ? `${product.Image[0]}` : 'public/uploads/product-images/default.jpg',
        price,
        originalPrice,
        itemDiscount,
        offer,
        quantity,
        itemTotal,
        stock: variant.Stock || 0
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
    const tax = Math.round(subtotal * 0.05);
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

const validateCoupon = async (req, res) => {
  try {
    const { couponCode, subtotal } = req.body;
    const cartTotal = parseFloat(subtotal);
    const userId = req.session.user;

    // Validate inputs
    if (!couponCode || isNaN(cartTotal) || cartTotal <= 0 || !userId) {
      console.error('Invalid input:', { couponCode, cartTotal, userId });
      return res.status(400).json({
        success: false,
        valid: false,
        message: 'Coupon code, valid cart total, and user ID are required.'
      });
    }

    console.log('Validating coupon:', { couponCode, cartTotal });

    // Find coupon
    const coupon = await Coupon.findOne({
      CouponCode: couponCode.trim().toUpperCase(),
      StartDate: { $lte: new Date() },
      ExpiryDate: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      IsListed: true,
      $or: [{ UserId: null }, { UserId: new mongoose.Types.ObjectId(userId) }],
      MinCartValue: { $lte: cartTotal }
    }).lean();

    if (!coupon) {
      console.log('Coupon not found or invalid:', couponCode);
      return res.status(400).json({
        success: false,
        valid: false,
        message: 'Invalid or expired coupon.'
      });
    }

    // Validate UsageLimit
    if (!Number.isInteger(coupon.UsageLimit) || coupon.UsageLimit <= 0) {
      console.error('Invalid coupon UsageLimit:', coupon.UsageLimit);
      return res.status(400).json({
        success: false,
        valid: false,
        message: 'Coupon has an invalid usage limit.'
      });
    }

    // Check usage count
    const usageCount = await Orders.countDocuments({ Coupon: coupon._id });
    if (usageCount >= coupon.UsageLimit) {
      console.log('Coupon usage limit reached:', { couponCode, usageCount, limit: coupon.UsageLimit });
      return res.status(400).json({
        success: false,
        valid: false,
        message: 'Coupon usage limit reached.'
      });
    }

    // Use explicit Discount field
    const discountPercentage = Number.isFinite(coupon.Discount) ? coupon.Discount : 0;
    if (discountPercentage <= 0 || discountPercentage > 100) {
      console.error('Invalid discount percentage:', discountPercentage);
      return res.status(400).json({
        success: false,
        valid: false,
        message: 'Invalid coupon discount percentage.'
      });
    }

    // Calculate discount
    let discountAmount = cartTotal * (discountPercentage / 100);
    if (coupon.MaxDiscount && Number.isFinite(coupon.MaxDiscount)) {
      discountAmount = Math.min(discountAmount, coupon.MaxDiscount);
    }
    discountAmount = Math.round(discountAmount * 100) / 100;

    console.log('Coupon applied:', { couponCode, discountPercentage, discountAmount });

    return res.status(200).json({
      success: true,
      valid: true,
      discount: discountPercentage, // Return percentage for frontend
      discountAmount, // Include amount for clarity
      couponId: coupon._id.toString(),
      message: 'Coupon applied successfully.'
    });
  } catch (err) {
    console.error('Coupon validation error:', {
      error: err.message,
      couponCode: req.body.couponCode,
      subtotal: req.body.subtotal,
      userId: req.session.user
    });
    return res.status(500).json({
      success: false,
      valid: false,
      message: 'Error validating coupon.'
    });
  }
};

const placeOrder = async (req, res) => {
  try {
    const { userId, selectedAddressId, coupon, paymentMethod } = req.body;
   
    const cart = await Cart.findOne({ user: userId }).populate('Items.product').lean();
    if (!cart || !cart.Items.length) {
      console.log('Cart empty or not found for user:', userId);
      return res.status(400).json({ success: false, message: 'Cart is empty.' });
    }
    const selectedAddress = await Address.findById(selectedAddressId).lean();
    if (!selectedAddress) {
      console.log('Invalid address:', selectedAddressId);
      return res.status(400).json({ success: false, message: 'Invalid address selected.' });
    }
    const hasOutOfStock = cart.Items.some(item => {
      const variant = item.product?.Variants?.[0];
      return !variant || variant.Stock === 0 || variant.Stock < item.quantity;
    });
    if (hasOutOfStock) {
      return res.status(400).json({ success: false, message: 'Some items are out of stock.' });
    }
    let subtotal = 0;
    const orderItems = [];
    for (const item of cart.Items) {
      const product = item.product;
      const variant = product?.Variants?.[0];
      if (!product || !variant) {
        console.error(`Invalid order item: productId=${item.product?._id || 'missing'}`);
        continue;
      }
      const { offer, salePrice } = await getProductOffer(product);
      const price = salePrice || variant.Price || 1;
      const quantity = item.quantity;
      const itemTotal = price * quantity;
      orderItems.push({
        product: product._id, // Use 'product' to match schema
        quantity,
        price,
        status: 'Pending'
      });
      subtotal += itemTotal;
    }
    if (!orderItems.length) {
      console.log('No valid order items after validation');
      return res.status(400).json({ success: false, message: 'No valid items in cart.' });
    }
    const tax = Math.round(subtotal * 0.05);
    const deliveryCharge = 40;
    let couponDiscount = 0;
    let couponData = null;
    if (coupon) {
      couponData = await Coupon.findOne({
        CouponCode: coupon.toUpperCase(),
        StartDate: { $lte: new Date() },
        ExpiryDate: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        IsListed: true,
        $or: [{ UserId: null }, { UserId: new mongoose.Types.ObjectId(userId) }],
        MinCartValue: { $lte: subtotal }
      });
      if (couponData && couponData.Discount > 0) {
        couponDiscount = Math.min(
          subtotal * (couponData.Discount / 100),
          subtotal + tax + deliveryCharge - 1
        );
      }
    }
    const finalTotal = subtotal - couponDiscount + tax + deliveryCharge;
    if (finalTotal < 1) {
      console.error('Final total too low:', finalTotal);
      return res.status(400).json({ success: false, message: 'Order amount must be at least ₹1.00 after discounts.' });
    }
    const order = new Orders({
      UserId: userId, // Match schema field
      addressId: selectedAddressId,
      Address: {
        name: selectedAddress.name,
        phone: selectedAddress.phone,
        alternativePhone: selectedAddress.alternativePhone,
        line1: selectedAddress.line1,
        town: selectedAddress.town,
        city: selectedAddress.city,
        state: selectedAddress.state,
        postCode: selectedAddress.postCode
      },
      Items: orderItems,
      PaymentMethod: paymentMethod,
      PaymentStatus: paymentMethod === 'COD' ? 'Pending' : paymentMethod === 'Wallet' ? 'Completed' : 'Pending',
      Status: 'Pending',
      OrderId: `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      OrderDate: new Date()
    });
    await order.save();
    if (paymentMethod === 'Wallet') {
      let wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        wallet = new Wallet({ userId, Balance: 0, Transaction: [] });
        await wallet.save();
      }
      if (wallet.balance < finalTotal) {
        console.log('Insufficient wallet balance:', { Balance: wallet.Balance, required: finalTotal });
        await Orders.findByIdAndDelete(order._id);
        return res.status(400).json({ success: false, message: 'Insufficient wallet balance.' });
      }
      wallet.Balance -= finalTotal;
      wallet.Transaction.push({
        amount: -finalTotal,
        type: 'debit',
        description: `Order payment for order ID: ${order.OrderId}`,
        date: new Date()
      });
      await wallet.save();
    }
    if (paymentMethod === 'Online') {
      const receiptString = `order_${userId}_${Date.now()}`;
      const truncatedReceipt = receiptString.length > 40 ? receiptString.substring(0, 40) : receiptString;
      const options = {
        amount: Math.round(finalTotal * 100),
        currency: 'INR',
        receipt: truncatedReceipt,
        notes: { userId, coupon, selectedAddressId, orderId: order._id }
      };
      const razorpayOrder = await razorpay.orders.create(options);
      return res.status(200).json({
        success: true,
        order: razorpayOrder,
        orderId: order._id,
        message: 'Proceed to Razorpay checkout.'
      });
    }
    console.log('Order placed:', order._id);
    await Cart.findOneAndUpdate({ user: userId }, { Items: [] });
    for (const item of orderItems) {
      await Products.findByIdAndUpdate(item.product, {
        $inc: { 'Variants.0.Stock': -item.quantity }
      });
    }
    return res.status(200).json({
      success: true,
      orderId: order._id,
      message: 'Order placed successfully.'
    });
  } catch (err) {
    console.error('Place order error:', err);
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => e.message).join(', ');
      return res.status(400).json({ success: false, message: `Validation error: ${errors}` });
    }
    if (err.statusCode === 400 && err.error?.code === 'BAD_REQUEST_ERROR') {
      return res.status(400).json({ success: false, message: err.error.description });
    }
    return res.status(500).json({ success: false, message: 'Error placing order.' });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, userId, selectedAddressId, coupon, finalTotal } = req.body;
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !userId || !selectedAddressId) {
      console.error('Missing payment verification fields');
      return res.status(400).json({ success: false, message: 'Payment verification details are required.' });
    }
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');
    if (generatedSignature !== razorpay_signature) {
      console.error('Invalid Razorpay signature');
      return res.status(400).json({ success: false, message: 'Invalid payment signature.' });
    }
    const cart = await Cart.findOne({ user: userId }).populate('Items.product').lean();
    if (!cart || !cart.Items.length) {
      return res.status(400).json({ success: false, message: 'Cart is empty.' });
    }
    const selectedAddress = await Address.findById(selectedAddressId).lean();
    if (!selectedAddress) {
      console.log('Invalid address:', selectedAddressId);
      return res.status(400).json({ success: false, message: 'Invalid address selected.' });
    }
    let subtotal = 0;
    let totalItemDiscount = 0;
    const orderItems = [];
    for (const item of cart.Items) {
      const product = item.product;
      const variant = product?.Variants?.[0];
      if (!product || !variant) {
        console.error(`Invalid order item: productId=${item.product?._id || 'missing'}`);
        continue;
      }
      const { offer, salePrice } = await getProductOffer(product);
      const price = salePrice || variant.Price || 1;
      const originalPrice = variant.Price || 1;
      const quantity = item.quantity;
      const itemTotal = price * quantity;
      const itemDiscount = (originalPrice - price) * quantity;
      orderItems.push({
        product,
        quantity,
        price,
        itemTotal
      });
      subtotal += itemTotal;
      totalItemDiscount += itemDiscount;
    }
    if (!orderItems.length) {
      console.log('No valid order items after validation');
      return res.status(400).json({ success: false, message: 'No valid items in cart.' });
    }
    const tax = Math.round(subtotal * 0.05);
    const deliveryCharge = 40;
    let couponDiscount = 0;
    let couponData = null;
    if (coupon) {
      couponData = await Coupon.findOne({
        CouponCode: coupon.toUpperCase(),
        StartDate: { $lte: new Date() },
        ExpiryDate: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        IsListed: true,
        $or: [{ UserId: null }, { UserId: new mongoose.Types.ObjectId(userId) }],
        MinCartValue: { $lte: subtotal }
      });
      if (couponData && couponData.Discount > 0) {
        couponDiscount = subtotal * (couponData.Discount / 100);
      }
    }
    
    const order = new Orders({
      UserId: userId,
      addressId: selectedAddressId,
      Items: orderItems,
      subtotal,
      coupon: couponData ? couponData._id : null,
      couponDiscount,
      totalItemDiscount,
      tax,
      deliveryCharge,
      finalTotal,
      PaymentMethod: 'Online',
      PaymentStatus: 'Completed',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      orderStatus: 'Confirmed',
      orderDate: new Date(),
      OrderId: `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`, 
    });
    await order.save();
    await Cart.findOneAndUpdate({ user: userId }, { Items: [] });
    for (const item of orderItems) {
      await Products.findByIdAndUpdate(item.product._id, { 
        $inc: { 'Variants.0.Stock': -item.quantity }
      });
    }
    return res.status(200).json({
      success: true,
      orderId: order._id,
      redirect: `/payment-success/${order._id}`
    });
  } catch (err) {
    console.error('Payment verification error:', err);
    return res.status(500).json({ success: false, message: 'Error verifying payment.', redirect: '/payment-failure' });
  }
};

const getPaymentSuccess = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await Orders.findById(orderId).populate('Items.product').lean();
    if (!order) {
      return res.status(404).render('page-404');
    }
    
    const userId = req.session.user;
    const user = await User.findById(userId).lean();
    const address = await Address.findOne({userId}).lean();
    console.log('address in payment success',address)
    res.render('razorOrderSuccess', {
      order,
      user,
      address,
      activePage: 'orders',
      successMessage : 'Payment Successfull'
    });
  } catch (err) {
    console.error('Payment success page error:', err);
    res.status(500).render('page-404');
  }
};

const getPaymentFailure = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    console.log('paymentfailure :',req.params.orderId)

    const order = await Orders.findById(orderId).populate('Items.product').lean();
    console.log('Order id in db',order._id)
    if (!order) {
      return res.status(404).render('page-404');
    }
    const userId = req.session.user;
    const user = await User.findById(userId).lean();
    res.render('razorOrderFailure', {
      order,
      user,
      activePage: 'orders'
    });
  } catch (err) {
    console.error('Payment failure page error:', err);
    res.status(500).render('page-404');
  }
};

const getOrderSuccess = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    
    const order = await Orders.findById(orderId).populate('Items.product').lean();
    if (!order) {
      return res.status(404).render('page-404');
    }
    const userId = req.session.user;
    const user = await User.findById(userId).lean();
    res.render('order-success', {
      order,
      user,
      activePage: 'orders'
    });
  } catch (err) {
    console.error('Order success page error:', err);
    res.status(500).render('page-404');
  }
};

const getOrderFailure = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId).lean();
    res.render('order-failure', {
      user,
      activePage: 'orders'
    });
  } catch (err) {
    console.error('Order failure page error:', err);
    res.status(500).render('page-404');
  }
};

const getChangePassword = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect('/login');
    const user = await User.findById(userId).lean();
    if (!user) return res.redirect('/login');
    res.render('change-password', {
      user,
      activePage: 'change-password',
      msg: req.flash('msg')
    });
  } catch (error) {
    console.error('Error loading change password page:', error);
    res.status(500).render('page-404');
  }
};

const changePassword = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.json({ success: false, message: 'All fields are required' });
    }
    if (newPassword !== confirmPassword) {
      return res.json({ success: false, message: 'New password and confirm password do not match' });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.json({ success: false, message: 'User not found' });
    }
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.json({ success: false, message: 'Current password is incorrect' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();
    return res.json({ success: true });
  } catch (error) {
    console.error('Password change error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const updateEmailRequestOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const userId = req.session.user;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.emailOTP = otp;
    req.session.newEmail = email;
    const emailSent = await sendVerification(email, otp);
    console.log(otp);
    if (!emailSent) {
      req.flash('msg', 'Failed to send OTP');
      return res.redirect('/profile');
    }
    res.redirect('/verify-email-otp');
  } catch (err) {
    console.error('OTP send error:', err);
    res.redirect('/profile');
  }
};

const addToWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId } = req.body;
    if (!userId || !productId) {
      return res.status(400).json({ success: false, message: 'User ID and product ID are required.' });
    }
    let wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      wishlist = new Wishlist({ userId, Items: [] });
    }
    if (wishlist.Items.some(item => item.productId.toString() === productId)) {
      return res.status(400).json({ success: false, message: 'Product already in wishlist.' });
    }
    wishlist.Items.push({ productId });
    await wishlist.save();
    return res.status(200).json({ success: true, message: 'Product added to wishlist.' });
  } catch (err) {
    console.error('Add to wishlist error:', err);
    return res.status(500).json({ success: false, message: 'Error adding to wishlist.' });
  }
};

const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId } = req.body;
    if (!userId || !productId) {
      return res.status(400).json({ success: false, message: 'User ID and product ID are required.' });
    }
    const wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      return res.status(404).json({ success: false, message: 'Wishlist not found.' });
    }
    wishlist.Items = wishlist.Items.filter(item => item.productId.toString() !== productId);
    await wishlist.save();
    return res.status(200).json({ success: true, message: 'Product removed from wishlist.' });
  } catch (err) {
    console.error('Remove from wishlist error:', err);
    return res.status(500).json({ success: false, message: 'Error removing from wishlist.' });
  }
};

const getWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect('/login');
    }
    const user = await User.findById(userId).lean();
    const wishlist = await Wishlist.findOne({ userId }).populate('Items.productId').lean();
    res.render('wishlist', {
      user,
      wishlist: wishlist ? wishlist.Items : [],
      activePage: 'wishlist'
    });
  } catch (err) {
    console.error('Get wishlist error:', err);
    res.status(500).render('page-404');
  }
};

const getOrders = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect('/login');
    }
    const user = await User.findById(userId).lean();
    const orders = await Orders.find({ UserId: userId })
      .populate('Items.product')
      .sort({ OrderDate: -1 })
      .lean();
    res.render('orders', {
      user,
      orders,
      activePage: 'orders'
    });
  } catch (err) {
    console.error('Get orders error:', err);
    res.status(500).render('page-404');
  }
};

const getAdminOrders = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId).lean();
    if (!user || !user.isAdmin) {
      return res.status(403).render('page-404', { message: 'Unauthorized access' });
    }
    const orders = await Orders.find()
      .populate('UserId', 'name email')
      .populate('Items.product')
      .sort({ OrderDate: -1 })
      .lean();
    res.render('admin-orders', {
      user,
      orders,
      activePage: 'admin-orders'
    });
  } catch (err) {
    console.error('Get admin orders error:', err);
    res.status(500).render('page-404');
  }
};

module.exports = {
  loadHomePage,
  pageNotFound,
  loadSignup,
  loadLogin,
  signup,
  verifyOtp,
  login,
  logout,
  getProductDetails,
  getShopPage,
  resendOtp,
  getForgotPasswordPage,
  handleForgotPassword,
  googleCallbackHandler,
  checkout,
  validateCoupon,
  placeOrder,
  verifyPayment,
  getPaymentSuccess,
  getPaymentFailure,
  getOrderSuccess,
  getOrderFailure,
  getChangePassword,
  changePassword,
  updateEmailRequestOtp,
  addToWishlist,
  removeFromWishlist,
  getWishlist,
  getOrders,
  getAdminOrders
};