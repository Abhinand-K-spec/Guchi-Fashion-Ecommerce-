const Wallet = require('../../model/walletSchema');
const Razorpay = require('razorpay');
const User = require('../../model/userSchema');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const getWallet = async (req, res) => {
  try {
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

const addFunds = async (req, res) => {
  try {
    const { userId, amount } = req.body;
    if (!userId || !amount || amount <= 0) {
      console.error('Invalid input:', { userId, amount });
      return res.status(400).json({ success: false, message: 'User ID and valid amount are required.' });
    }

    const wallet = await Wallet.findOne({ UserId: userId });
    if (!wallet) {
      await Wallet.create({ UserId: userId, Balance: 0, Transaction: [] });
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: `wallet_${userId}_${Date.now()}`
    });

    console.log('Razorpay order created for wallet:', { razorpayOrderId: razorpayOrder.id, amount });

    return res.status(200).json({
      success: true,
      order: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount
      },
      message: 'Proceed to Razorpay checkout.'
    });
  } catch (err) {
    console.error('Add funds error:', err);
    return res.status(500).json({ success: false, message: 'Error initiating fund addition.' });
  }
};

const verifyWalletPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, userId, amount } = req.body;
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !userId || !amount) {
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

    console.log('Wallet updated:', { userId, newBalance: wallet.Balance });

    return res.status(200).json({
      success: true,
      message: 'Funds added successfully.'
    });
  } catch (err) {
    console.error('Verify wallet payment error:', err);
    return res.status(500).json({ success: false, message: 'Error verifying payment.' });
  }
};

module.exports = { getWallet, addFunds, verifyWalletPayment };
