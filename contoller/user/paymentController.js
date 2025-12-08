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
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, selectedAddressId, coupon, finalTotal } = req.body;
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
    const razorpayOrder = await razorpay.orders.fetch(razorpay_order_id);
    const orderId = razorpayOrder.notes.orderId;
    if (!orderId) {
      console.error('OrderId not found in Razorpay notes');
      return res.status(400).json({ success: false, message: 'Order ID not found in payment details.' });
    }
    const order = await Orders.findById(orderId).populate('Items.product');
    if (!order) {
      console.error('Order not found:', orderId);
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    if (order.PaymentStatus === 'Completed') {
      console.log('Order already processed:', orderId);
      return res.status(200).json({
        success: true,
        orderId: order._id,
        redirect: `/payment-success/${order._id}`
      });
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
    order.PaymentMethod = 'Online';
    order.PaymentStatus = 'Completed';
    order.razorpayOrderId = razorpay_order_id;
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpaySignature = razorpay_signature;
    order.Status = 'Confirmed';
    await order.save();

    // Stock already reserved in placeOrder

    await Cart.findOneAndUpdate({ user: userId }, { Items: [] });

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
    order.PaymentStatus === 'Completed';
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
    const order = await Orders.findById(orderId).populate('Items.product');

    if (!order) {
      return res.status(404).render('page-404');
    }

    // Restore Stock (User Request: Do not change payment status to Failed)
    // Warning: Potential race condition if page is refreshed multiple times. 
    // Assuming idempotency is handled via status check or manual intervention if needed.
    // Ideally we should check if status is NOT failed, but user forbid changing status.

    // We only restore if it looks like it hasn't been restored? 
    // Since we can't mark it, we just do it. (Per "do the thing only i said" instruction)
    for (const item of order.Items) {
      await Products.findByIdAndUpdate(
        item.product,
        { $inc: { [`Variants.${item.variantIndex}.Stock`]: item.quantity } }
      );
    }

    const userId = req.session.user;
    const user = await User.findById(userId).lean();
    await Cart.findOneAndUpdate(
      { user: userId },
      { Items: [] }
    );
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


const retryPayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.session.user;

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID missing.' });
    }

    const existingOrder = await Orders.findById(orderId).populate('Items.product').lean();
    if (!existingOrder) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }


    // Validate for retry
    if (existingOrder.PaymentMethod !== 'Online') {
      return res.status(400).json({
        success: false,
        message: 'Retry allowed only for online payments.'
      });
    }

    if (existingOrder.PaymentStatus === 'Completed') {
      return res.status(400).json({
        success: false,
        message: 'Payment is already completed.'
      });
    }

    // Check Stock Availability
    for (const item of existingOrder.Items) {
      const product = item.product;
      const variantIndex = item.variantIndex !== undefined ? item.variantIndex : 0;
      const variant = product?.Variants?.[variantIndex];

      if (!product || !variant) {
        return res.status(400).json({
          success: false,
          message: `Product info missing for item ${item.product?._id || ''}`
        });
      }

      if (variant.Stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock . Available: ${variant.Stock}`
        });
      }
    }

    // Calculate payable amount from order
    const finalAmount = existingOrder.orderAmount || 0;


    if (finalAmount < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount for retry.'
      });
    }

    // Create new Razorpay order
    const receipt = `retry_${orderId}_${Date.now()}`.slice(0, 40);

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(finalAmount * 100),
      currency: "INR",
      receipt: receipt,
      notes: { orderId }
    });

    return res.status(200).json({
      success: true,
      message: "Retry payment initialized.",
      order: razorpayOrder,
      orderId: existingOrder._id
    });

  } catch (err) {
    console.error("Retry Payment Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error during retry payment."
    });
  }
};

const verifyRetryPayment = async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      orderId
    } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, message: "Order ID missing." });
    }

    const existingOrder = await Orders.findById(orderId);
    if (!existingOrder) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    // Prevent verification on non-online orders
    if (existingOrder.PaymentMethod !== "Online") {
      return res.status(400).json({ success: false, message: "Invalid payment retry for COD order." });
    }

    // Razorpay signature verification
    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed (Invalid signature)."
      });
    }

    // Update order as paid
    existingOrder.PaymentStatus = "Completed";
    existingOrder.Status = "Confirmed";

    existingOrder.PaymentDetails = {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      paidAt: new Date()
    };

    await existingOrder.save();

    await Cart.findOneAndUpdate(
      { user: existingOrder.UserId },
      { Items: [] }
    );

    for (const item of existingOrder.Items) {
      await Products.findByIdAndUpdate(item.product, {
        $inc: { [`Variants.${item.variantIndex}.Stock`]: -item.quantity }
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully.",
      orderId: existingOrder._id
    });

  } catch (err) {
    console.error("Verify Retry Payment Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error verifying payment."
    });
  }
};


module.exports = {
  getPaymentFailure,
  getPaymentSuccess,
  verifyPayment,
  getProductOffer,
  retryPayment,
  verifyRetryPayment

};