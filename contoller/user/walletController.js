const Wallet = require('../../model/walletSchema');
const Razorpay = require('razorpay');
const User = require('../../model/userSchema');
const crypto = require('crypto');
const Order = require('../../model/ordersSchema');
const HttpStatus = require('../../config/httpStatus');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');


const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const getWallet = catchAsync(async (req, res, next) => {
  const userId = req.session.user;
  if (!userId) {
    return res.redirect('/login');
  }
  const user = await User.findById(userId).lean();
  const wallet = await Wallet.findOne({ UserId: userId }).lean() || {
    UserId: userId,
    Balance: 0,
    Transaction: []
  };

  if (wallet.Transaction && wallet.Transaction.length > 0) {
    wallet.Transaction.sort((a, b) => b.TransactionDate - a.TransactionDate);
  }

  res.render('wallet', {
    pageTitle: 'My Wallet',
    user,
    wallet,
    userId,
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
    activePage: 'wallet'
  });
});

const addFunds = catchAsync(async (req, res, next) => {
  const { userId, amount } = req.body;
  if (!userId || !amount || amount <= 0) {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'User ID and valid amount are required.' });
  }

  const wallet = await Wallet.findOne({ UserId: userId });
  if (!wallet) {
    await Wallet.create({ UserId: userId, Balance: 0, Transaction: [] });
  }

  const shortId = userId.toString().slice(-6);
  const razorpayOrder = await razorpay.orders.create({
    amount: Math.round(amount * 100),
    currency: 'INR',
    receipt: `WAL${shortId}_${Date.now().toString().slice(-6)}`
  });


  return res.status(HttpStatus.OK).json({
    success: true,
    order: {
      id: razorpayOrder.id,
      amount: razorpayOrder.amount
    },
    message: 'Proceed to Razorpay checkout.'
  });
});

const verifyWalletPayment = catchAsync(async (req, res, next) => {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature, userId, amount } = req.body;
  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !userId || !amount) {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Payment verification details are required.' });
  }

  const generatedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (generatedSignature !== razorpay_signature) {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Invalid payment signature.' });
  }

  let wallet = await Wallet.findOne({ UserId: userId });
  if (!wallet) {
    wallet = new Wallet({ UserId: userId, Balance: 0, Transaction: [] });
  }

  wallet.Balance += parseFloat(amount);
  wallet.Transaction.push({
    TransactionAmount: parseFloat(amount),
    TransactionType: 'credit',
    TransactionDate: new Date()
  });
  wallet.UpdatedAt = new Date();
  await wallet.save();

  return res.status(HttpStatus.OK).json({
    success: true,
    message: 'Funds added successfully.'
  });
});



const payWithWallet = catchAsync(async (req, res, next) => {
  const { userId, orderId, amount } = req.body;

  if (!userId || !orderId || !amount || amount <= 0) {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Invalid payment details.' });
  }


  const wallet = await Wallet.findOne({ UserId: userId });
  if (!wallet) {
    return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: 'Wallet not found.' });
  }


  if (wallet.Balance < amount) {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Insufficient wallet balance.' });
  }


  wallet.Balance -= amount;
  wallet.Transaction.push({
    TransactionAmount: amount,
    TransactionType: 'debit',
    TransactionDate: new Date(),
    Note: `Payment for Order #${orderId}`
  });
  await wallet.save();


  const order = await Order.findById(orderId);
  if (!order) {
    return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: 'Order not found.' });
  }

  order.paymentMethod = 'Wallet';
  order.status = 'Paid';
  order.paymentStatus = 'Completed';
  await order.save();



  return res.status(HttpStatus.OK).json({
    success: true,
    message: 'Payment successful via wallet.',
    newBalance: wallet.Balance
  });
});

module.exports = {
  getWallet,
  addFunds,
  verifyWalletPayment,
  payWithWallet
};
