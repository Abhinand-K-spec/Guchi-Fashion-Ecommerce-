const Wallet = require('../../model/walletSchema');
const Razorpay = require('razorpay');
const User = require('../../model/userSchema');
const crypto = require('crypto');
const Orders = require('../../model/ordersSchema');
const Products = require('../../model/productSchema');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});


// ===========================
// ✅ GET WALLET PAGE
// ===========================
const getWallet = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect('/login');

    const user = await User.findById(userId).lean();
    const wallet = await Wallet.findOne({ UserId: userId }).lean() || {
      UserId: userId,
      Balance: 0,
      Transaction: []
    };

    if (wallet.Transaction?.length > 0) {
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

  } catch (err) {
    console.error('Get wallet error:', err);
    res.status(500).render('page-404');
  }
};


// ===========================
// ✅ ADD FUNDS (RAZORPAY INIT)
// ===========================
const addFunds = async (req, res) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount.' });
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

    return res.status(200).json({
      success: true,
      order: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount
      }
    });

  } catch (err) {
    console.error('Add funds error:', err);
    return res.status(500).json({ success: false, message: 'Error initiating wallet top-up.' });
  }
};


// ===========================
// ✅ VERIFY WALLET PAYMENT
// ===========================
const verifyWalletPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, userId, amount } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !userId || !amount) {
      return res.status(400).json({ success: false, message: 'Missing payment details.' });
    }

    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature.' });
    }

    let wallet = await Wallet.findOne({ UserId: userId });

    if (!wallet) {
      wallet = new Wallet({ UserId: userId, Balance: 0, Transaction: [] });
    }

    wallet.Balance += parseFloat(amount);
    wallet.Transaction.push({
      TransactionAmount: parseFloat(amount),
      TransactionType: 'credit',
      TransactionDate: new Date(),
      Note: 'Wallet Recharge'
    });

    await wallet.save();

    return res.status(200).json({ success: true, message: 'Wallet recharged successfully.' });

  } catch (err) {
    console.error('Verify wallet payment error:', err);
    return res.status(500).json({ success: false, message: 'Error verifying wallet payment.' });
  }
};


// ===========================
// ⭐ PAY FOR ORDER USING WALLET (VARIANT-SAFE)
// ===========================
const payWithWallet = async (req, res) => {
  try {
    const { userId, orderId, amount } = req.body;

    if (!userId || !orderId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid payment details.' });
    }

    const wallet = await Wallet.findOne({ UserId: userId });

    if (!wallet) {
      return res.status(404).json({ success: false, message: 'Wallet not found.' });
    }

    if (wallet.Balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance.' });
    }

    const order = await Orders.findById(orderId).populate('Items.product');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    // ⭐ Deduct wallet balance
    wallet.Balance -= amount;
    wallet.Transaction.push({
      TransactionAmount: amount,
      TransactionType: 'debit',
      TransactionDate: new Date(),
      Note: `Payment for Order #${order.OrderId}`
    });
    await wallet.save();

    // ⭐ Update order status
    order.PaymentMethod = 'Wallet';
    order.PaymentStatus = 'Completed';
    order.Status = 'Confirmed';
    await order.save();

    // ⭐ Reduce stock by VARIANT & SIZE
    for (const item of order.Items) {
      if (item.size) {
        await Products.updateOne(
          { _id: item.product, "Variants.Size": item.size },
          { $inc: { "Variants.$.Stock": -item.quantity } }
        );
      } else {
        // Fallback for very old orders without size stored
        await Products.updateOne(
          { _id: item.product },
          { $inc: { "Variants.0.Stock": -item.quantity } }
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Order paid successfully via wallet.',
      newBalance: wallet.Balance
    });

  } catch (err) {
    console.error('Wallet payment error:', err);
    return res.status(500).json({ success: false, message: 'Error processing wallet payment.' });
  }
};


module.exports = {
  getWallet,
  addFunds,
  verifyWalletPayment,
  payWithWallet
};
