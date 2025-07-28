const Orders = require('../../model/ordersSchema');
const Products = require('../../model/productSchema');
const Address = require('../../model/addressSchema');
const User = require('../../model/userSchema');
const Wallet = require('../../model/walletSchema');
const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

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
        match: { 'Variants.0.Stock': { $gt: 0 } },
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
    console.log('here cancel order');
    
    const order = await Orders.findById(req.params.id).populate('Items.product');
    if (!order || order.Status !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Order not found or not in Pending status' });
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
          item.cancelReason = req.body.reason || 'No reason provided';
          refundAmount += item.price * item.quantity; // Calculate refund for this item
        }
      }
    }

    const allCancelled = order.Items.every(i => i.status === 'Cancelled');
    if (allCancelled) {
      order.Status = 'Cancelled';
      order.CancelReason = req.body.reason || 'No reason provided';
    }

    // Refund to wallet if payment method is Wallet
    if (order.PaymentMethod === 'Wallet' && refundAmount > 0) {
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
    // console.log('here cancel item')
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

    // Refund to wallet if payment method is Wallet
    if (order.PaymentMethod === 'Wallet' || order.PaymentMethod === 'Online') {
      const refundAmount = item.price * item.quantity;
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

module.exports = {
  listOrders,
  orderDetails,
  cancelOrder,
  cancelItem,
  requestReturnItem,
  downloadInvoice
};