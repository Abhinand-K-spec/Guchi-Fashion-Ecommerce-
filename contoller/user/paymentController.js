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

const verifyPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature,  selectedAddressId, coupon, finalTotal } = req.body;
    const userId = req.session.user;
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
        product: product._id,
        quantity,
        price,
        itemDiscount,
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
        if (couponData.MaxDiscount && Number.isFinite(couponData.MaxDiscount)) {
          couponDiscount = Math.min(couponDiscount, couponData.MaxDiscount);
        }
        couponDiscount = Math.round(couponDiscount * 100) / 100;
        const totalItemTotal = orderItems.reduce((sum, item) => sum + item.itemTotal, 0);
        orderItems.forEach(item => {
          const itemRatio = item.itemTotal / totalItemTotal;
          item.itemDiscount = (item.itemDiscount || 0) + Math.round((couponDiscount * itemRatio) * 100) / 100;
        });
      }
    }
    const discountAmount = totalItemDiscount + couponDiscount;
    const order = new Orders({
      UserId: userId,
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
      subtotal,
      coupon: couponData ? couponData._id : null,
      couponDiscount,
      discountAmount,
      totalItemDiscount,
      tax,
      deliveryCharge,
      finalTotal,
      PaymentMethod: 'Online',
      PaymentStatus: 'Completed',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      Status: 'Confirmed',
      OrderDate: new Date(),
      OrderId: `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`, 
    });
    await order.save();
    await Cart.findOneAndUpdate({ user: userId }, { Items: [] });
    for (const item of orderItems) {
      await Products.findByIdAndUpdate(item.product, { 
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
    const address = await Address.findOne({ userId }).lean();
    res.render('razorOrderSuccess', {
      order,
      user,
      address,
      activePage: 'orders',
      successMessage: 'Payment Successful'
    });
  } catch (err) {
    console.error('Payment success page error:', err);
    res.status(500).render('page-404');
  }
};

const getPaymentFailure = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    console.log('paymentfailure:', req.params.orderId);
    const order = await Orders.findById(orderId).populate('Items.product').lean();
    console.log('paymentfailure:', order.Items[0].product);
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

module.exports = {
    getPaymentFailure,
    getPaymentSuccess,
    verifyPayment,
    getProductOffer
}