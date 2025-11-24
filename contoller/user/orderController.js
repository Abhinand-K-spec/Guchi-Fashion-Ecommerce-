const Orders = require('../../model/ordersSchema');
const Products = require('../../model/productSchema');
const Address = require('../../model/addressSchema');
const User = require('../../model/userSchema');
const Wallet = require('../../model/walletSchema');
const Offers = require('../../model/offersSchema');
const Cart = require('../../model/cartSchema');
const Coupon = require('../../model/couponsSchema');
const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const Razorpay = require('razorpay');
const crypto = require('crypto');
require('dotenv').config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const listOrders = async (req, res) => {
  try {
    const userId = req.session.user;
    const search = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const query = { UserId: userId };
    if (search) {
      query.OrderId = { $regex: search, $options: 'i' };
    }

    const totalOrders = await Orders.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit);

    const orders = await Orders.find(query)
      .populate({
        path: 'Items.product',
      })
      .populate('UserId')
      .sort({ OrderDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const filteredOrders = orders.filter(order => order.Items.some(item => item.product));
    const userData = userId ? await User.findById(userId) : null;

    res.render('order-list', {
      orders: filteredOrders.map(order => ({
        ...order,
        Items: order.Items.filter(item => item.product)
      })),
      user: userData,
      activePage: 'orders',
      currentPage: page,
      totalPages,
      search
    });
  } catch (error) {
    console.error("List Orders Error:", error);
    res.status(500).render('page-404');
  }
};

const orderDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect('/login');

    const order = await Orders.findById(req.params.id)
      .populate({
        path: 'Items.product',
        match: {},
      })
      .populate('UserId', 'name email')
      .lean();

    if (!order) return res.render('page-404');

    order.Items = order.Items.filter(item => item.product);

    res.render('order-details', {
      order,
      user: order.UserId,
      activePage: 'orders'
    });
  } catch (err) {
    console.error("Order Details Error:", err);
    res.status(500).render('page-404');
  }
};

const cancelOrder = async (req, res) => {
  try {
    const order = await Orders.findById(req.params.id).populate('Items.product');
    const { reason } = req.body; 

    if (!reason) {
      return res.status(400).json({ success: false, message: 'Cancellation reason is required' });
    }

    let refundAmount = 0;
    for (const item of order.Items) {
      if (item.status !== 'Cancelled' && item.returnStatus === 'NotRequested') {
        const product = item.product;
        const variant = product?.Variants?.[0];
        if (variant) {
          variant.Stock += item.quantity;
          await product.save();
          item.status = 'Cancelled';
          item.cancelReason = reason; 
        }
      }
    }


      const totalOrderAmountBeforeDiscount = order.Items.reduce((sum, i) => sum + (i.originalPrice || i.price) * i.quantity, 0);
      const overallDiscount = order.Items.reduce((sum,item)=> sum+=item.itemDiscount,0);
      const tax = ((totalOrderAmountBeforeDiscount-overallDiscount)*0.5)/100 ;
      refundAmount = totalOrderAmountBeforeDiscount - overallDiscount + tax + 40 ;
    

    const allCancelled = order.Items.every(i => i.status === 'Cancelled');
    if (allCancelled) {
      order.Status = 'Cancelled';

    }

    if (order.PaymentMethod === 'Wallet' || order.PaymentMethod === 'Online') {
      let wallet = await Wallet.findOne({ UserId: order.UserId });
      if (!wallet) {
        wallet = new Wallet({ UserId: order.UserId, Balance: 0, Transaction: [] });
      }
      wallet.Balance += refundAmount;
      wallet.Transaction.push({
        TransactionAmount: refundAmount,
        TransactionType: 'credit',
        Description: `Refund for cancelled order ID: ${order.OrderId}`,
        Date: new Date()
      });
      await wallet.save();
    }

    await order.save();
    return res.json({ success: true, message: 'Order cancelled successfully', orderStatus: order.Status });
  } catch (err) {
    console.error("Cancel Order Error:", err);
    return res.status(500).json({ success: false, message: 'An error occurred while cancelling the order' });
  }
};



const cancelItem = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const userId = req.session.user;
    const { reason } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({ success: false, message: 'Cancellation reason is required' });
    }

    const order = await Orders.findOne({ _id: orderId, UserId: userId }).populate('Items.product');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found or not authorized' });
    }

    const item = order.Items.find(i => i._id.toString() === itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found in order' });
    }
    if (item.status === 'Cancelled') {
      return res.status(400).json({ success: false, message: 'Item is already cancelled' });
    }
    if (item.returnStatus !== 'NotRequested') {
      return res.status(400).json({ success: false, message: 'Item with a return request cannot be cancelled' });
    }

    item.status = 'Cancelled';
    item.cancelReason = reason;

    const product = item.product;
    if (product && product.Variants?.[0]) {
      product.Variants[0].Stock += item.quantity;
      await product.save();
    }

    const delivery = 40;
    const tax = (((item.price * item.quantity) * 0.05)) / 100;

    let refundAmount = item.price * item.quantity + tax + delivery - item.itemDiscount ;

    if (order.PaymentMethod === 'Wallet' || order.PaymentMethod === 'Online') {
      let wallet = await Wallet.findOne({ UserId: order.UserId });
      if (!wallet) {
        wallet = new Wallet({ UserId: order.UserId, Balance: 0, Transaction: [] });
      }
      wallet.Balance += refundAmount;
      wallet.Transaction.push({
        TransactionAmount: refundAmount,
        TransactionType: 'credit',
        Description: `Refund for cancelled item in order ID: ${order.OrderId}`,
        Date: new Date()
      });
      await wallet.save();
    }

    const allCancelled = order.Items.every(i => i.status === 'Cancelled');
    if (allCancelled) {
      order.Status = 'Cancelled';
      order.CancelReason = reason;
    }

    await order.save();
    return res.status(200).json({ success: true, message: 'Item cancelled successfully', orderStatus: order.Status });
  } catch (error) {
    console.error('Error cancelling item:', error.message, error.stack);
    return res.status(500).json({ success: false, message: 'Internal Server Error', details: error.message });
  }
};

const requestReturnItem = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const userId = req.session.user;
    const { reason } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({ success: false, message: 'Return reason is required' });
    }

    const order = await Orders.findOne({ _id: orderId, UserId: userId }).populate('Items.product');
    if (!order) {
      console.log('Order not found or not authorized:', { orderId, userId });
      return res.status(404).json({ success: false, message: 'Order not found or not authorized' });
    }

    const item = order.Items.find(i => i._id.toString() === itemId);
    if (!item) {
      console.log('Item not found in order:', { itemId });
      return res.status(404).json({ success: false, message: 'Item not found in order' });
    }
    if (item.status === 'Cancelled') {
      console.log('Cancelled item cannot be returned:', { itemId });
      return res.status(400).json({ success: false, message: 'Cancelled item cannot be returned' });
    }
    if (item.returnStatus !== 'NotRequested') {
      console.log('Return already requested or processed:', { itemId, returnStatus: item.returnStatus });
      return res.status(400).json({ success: false, message: 'Return already requested or processed' });
    }

    const deliveryDate = order.deliveryDate || new Date();
    const daysSinceDelivery = (new Date() - deliveryDate) / (1000 * 60 * 60 * 24);
    if (daysSinceDelivery > 7) {
      console.log('Return window expired:', { daysSinceDelivery });
      return res.status(400).json({ success: false, message: 'Return window has expired' });
    }

    item.returnStatus = 'Return Requested';
    item.returnReason = reason;
    item.returnRequestedAt = new Date();

    await order.save();
    return res.status(200).json({ success: true, message: 'Return request submitted successfully' });
  } catch (error) {
    console.error('Error requesting item return:', error.message, error.stack);
    return res.status(500).json({ success: false, message: 'Internal Server Error', details: error.message });
  }
};

const downloadInvoice = async (req, res) => {
  try {
    const order = await Orders.findById(req.params.id)
      .populate('Items.product')
      .populate('Address')
      .lean();

    if (!order) return res.render('page-404');

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.OrderId}.pdf"`);

    doc.pipe(res);

    try {
      const logoPath = path.join(__dirname, '../../public/guchi-logo.png');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 45, { width: 50 });
      }
    } catch (e) {
      console.warn('Logo missing or not loaded');
    }

    doc
      .fontSize(20)
      .text("Guchi Men's Fashion", 110, 50)
      .fontSize(16)
      .text("INVOICE", { align: 'right' })
      .moveDown(2);

    doc
      .fontSize(12)
      .text(`Order ID: ${order.OrderId}`)
      .text(`Order Date: ${new Date(order.OrderDate).toLocaleString()}`)
      .text(`Status: ${order.Status}`)
      .moveDown();

    const addr = order.Address || {};
    doc
      .font('Helvetica-Bold')
      .text("Shipping Address:")
      .font('Helvetica')
      .text(`${addr.name || ''}`)
      .text(`${addr.line1 || ''}, ${addr.city || ''}, ${addr.state || ''}`)
      .text(`Pin: ${addr.postCode || ''}, Phone: ${addr.phone || ''}`)
      .moveDown();

    const tableTop = doc.y + 10;
    const itemNoX = 50;
    const productNameX = 90;
    const qtyX = 310;
    const priceX = 370;
    const subtotalX = 450;

    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('No.', itemNoX, tableTop)
      .text('Product Name', productNameX, tableTop)
      .text('Qty', qtyX, tableTop)
      .text('Price (₹)', priceX, tableTop)
      .text('Subtotal (₹)', subtotalX, tableTop);

    doc
      .moveTo(itemNoX, tableTop + 15)
      .lineTo(530, tableTop + 15)
      .stroke();

    let total = 0;
    let currentY = tableTop + 25;
    const tableRows = order.Items.map((item, index) => {
      const product = item.product || {};
      const name = product.productName || 'Unnamed';
      const price = product.Variants?.[0]?.Price || item.price || 0;
      const qty = item.quantity || 1;
      const subtotal = price * qty;
      total += subtotal;

      return {
        no: index + 1,
        name,
        qty,
        price: `₹${price.toFixed(2)}`,
        subtotal: `₹${subtotal.toFixed(2)}`,
      };
    });

    if (!tableRows.length) {
      doc.text('No items found in the order.', { align: 'center' });
    } else {
      doc.font('Helvetica').fontSize(12);
      tableRows.forEach((row) => {
        doc
          .text(row.no, itemNoX, currentY)
          .text(row.name, productNameX, currentY, { width: 200, ellipsis: true })
          .text(row.qty, qtyX, currentY)
          .text(row.price, priceX, currentY)
          .text(row.subtotal, subtotalX, currentY);
        currentY += 20;
      });
    }

    doc
      .moveDown()
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(`Total: ₹${total.toFixed(2)}`, { align: 'right' });

    doc.end();
  } catch (err) {
    console.error("Invoice Download Error:", err);
    res.status(500).render('page-404');
  }
};

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

const placeOrder = async (req, res) => {

  try {
    
    const { selectedAddressId, coupon, paymentMethod } = req.body;
    const userId = req.session.user;


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
    let totalItemDiscount = 0;

    for (const item of cart.Items) {
      const product = item.product;
      const variant = product?.Variants?.[0];
      if (!product || !variant) {
        console.error(`Invalid order item: productId=${item.product?._id || 'missing'}`);
        continue;
      }

      const { offer, salePrice } = await getProductOffer(product);
      const originalPrice = variant.Price || 0;
      const price = salePrice || variant.Price || 0;
      const quantity = item.quantity || 0;
      const itemTotal = price * quantity;
      const itemDiscount = (originalPrice - price) * quantity;

      if (isNaN(itemDiscount) || isNaN(quantity) || isNaN(price)) {
        console.error(`Invalid values for product ${product._id}: itemDiscount=${itemDiscount}, quantity=${quantity}, price=${price}`);
        continue;
      }

      orderItems.push({
        product: product._id,
        quantity,
        price,
        originalPrice,
        status: 'Pending',
        itemDiscount
      });

      subtotal += itemTotal;
      totalItemDiscount += itemDiscount;
    }

    if (!orderItems.length) {
      console.log('No valid order items after validation');
      return res.status(400).json({ success: false, message: 'No valid items in cart.' });
    }



    const tax = Math.round(subtotal * 0.005);
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

        const totalItemTotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        orderItems.forEach(item => {
          const itemRatio = (item.price * item.quantity) / totalItemTotal;
          item.itemDiscount = (item.itemDiscount || 0) + Math.round((couponDiscount * itemRatio) * 100) / 100;
        });
      }
    }

    const discountAmount = totalItemDiscount + couponDiscount;

    if (isNaN(discountAmount)) {
      console.error('Invalid discountAmount calculated:', discountAmount);
      discountAmount = 0;
    }




    const finalTotal = subtotal - discountAmount + tax + deliveryCharge;

    if (finalTotal < 1) {

      return res.status(400).json({ success: false, message: 'Order amount must be at least ₹1.00 after discounts.' });
    }

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
      PaymentMethod: paymentMethod,
      discountAmount: discountAmount,
      couponDiscount,
      totalItemDiscount,
      subtotal,
      tax,
      deliveryCharge,
      PaymentStatus: paymentMethod === 'COD' ? 'Pending' : paymentMethod === 'Wallet' ? 'Completed' : 'Pending',
      Status: 'Pending',
      OrderId: `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      OrderDate: new Date(),
      coupon: couponData ? couponData._id : null
    });

    await order.save();


    if (paymentMethod === 'Wallet') {
      let wallet = await Wallet.findOne({ UserId:userId });
      if (!wallet) {
        wallet = new Wallet({ userId, Balance: 0, Transaction: [] });
        await wallet.save();
      }
      if (wallet.Balance < finalTotal) {
        console.log('Insufficient wallet balance:', { Balance: wallet.Balance, required: finalTotal });
        await Orders.findByIdAndDelete(order._id);
        return res.status(400).json({ success: false, message: 'Insufficient wallet balance.' });
      }
      wallet.Balance -= finalTotal;
      wallet.Transaction.push({
        TransactionAmount: -finalTotal,
        TransactionType:'debit',
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


for (const item of order.Items) {
  await Products.findByIdAndUpdate(item.product, {
    $inc: { "Variants.0.Stock": -item.quantity }
  });
}


await Cart.findOneAndUpdate({ user: userId }, { Items: [] });

return res.status(200).json({
  success: true,
  orderId: order._id,
  message: "Order placed successfully."
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

module.exports = {
  listOrders,
  orderDetails,
  cancelOrder,
  cancelItem,
  requestReturnItem,
  downloadInvoice,
  placeOrder,
  getProductOffer
};