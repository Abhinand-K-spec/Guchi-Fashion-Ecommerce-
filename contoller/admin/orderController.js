const Orders = require('../../model/ordersSchema');
const User = require('../../model/userSchema');
const Product = require('../../model/productSchema');
const Wallet = require('../../model/walletSchema');
const HttpStatus = require('../../config/httpStatus');
const { after } = require('lodash');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');

const getAdminOrders = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 12;
  const search = req.query.search || '';
  const statusFilter = req.query.status || '';

  const filter = {};
  if (search) {
    filter.OrderId = { $regex: search, $options: 'i' };
  }

  let orders = await Orders.find(filter)
    .sort({ createdAt: -1 })
    .populate('UserId', 'name email')
    .populate('Items.product')
    .lean();


  orders = orders.map(order => {
    const statuses = order.Items.map(i => i.status);

    let computedStatus = "";

    if (order.PaymentStatus === "Pending") {
      computedStatus = "Payment Failed";
    } else if (statuses.every(s => s === "Delivered")) {
      computedStatus = "Delivered";
    } else if (statuses.every(s => s === "Cancelled")) {
      computedStatus = "Cancelled";
    } else if (statuses.every(s => s === "Returned")) {
      computedStatus = "Returned";
    } else if (statuses.includes("Delivered") && statuses.includes("Pending")) {
      computedStatus = "Partially Delivered";
    } else if (statuses.includes("Returned") && statuses.includes("Delivered")) {
      computedStatus = "Partially Returned";
    } else if (statuses.includes("Pending")) {
      computedStatus = "Pending";
    } else {
      computedStatus = statuses[0] || "Pending";
    }

    return { ...order, computedStatus };
  });


  if (statusFilter && statusFilter.trim() !== "") {
    orders = orders.filter(o => o.computedStatus === statusFilter);
  }


  const totalOrders = orders.length;
  const paginatedOrders = orders.slice((page - 1) * limit, page * limit);

  res.render('order-manage', {
    orders: paginatedOrders,
    currentPage: page,
    totalPages: Math.ceil(totalOrders / limit),
    search,
    status: statusFilter,
  });
});


const getOrderDetails = catchAsync(async (req, res, next) => {
  const { orderId } = req.params;
  const order = await Orders.findById(orderId)
    .populate('UserId', 'name email')
    .populate('Items.product')
    .lean();
  if (!order) { return next(new AppError('Order not found', HttpStatus.NOT_FOUND)); }

  res.render('order-details-manage', { order, activePage: 'order' });
});

const approveReturn = catchAsync(async (req, res, next) => {
  const { orderId } = req.params;
  const { productId } = req.query;

  const order = await Orders.findById(orderId).populate('Items.product');
  if (!order) { return res.status(HttpStatus.NOT_FOUND).send('Order not found'); }

  const item = order.Items.find(item => item.product?._id.toString() === productId);
  if (!item) { return res.status(HttpStatus.NOT_FOUND).send('Item not found in order'); }
  if (item.returnStatus !== 'Return Requested') { return res.status(HttpStatus.BAD_REQUEST).send('Item return not requested'); }

  const variantIndex = item.variantIndex !== undefined ? item.variantIndex : 0;
  const updateQuery = {};
  updateQuery[`Variants.${variantIndex}.Stock`] = item.quantity;

  await Product.updateOne(
    { _id: item.product },
    { $inc: updateQuery }
  );

  item.returnStatus = 'Request Approved';
  item.status = 'Returned';

  const delivery = order.totalDeliveryCharge || 40;

  let refundAmount = item.finalPayableAmount || ((item.originalPrice || item.price || 0) * item.quantity);

  const allReturned = order.Items.every(i => i.status === 'Returned' || (i.product?._id.toString() === productId && i.returnStatus === 'Return Requested'));
  if (allReturned) {
    refundAmount += delivery;
  }

  if (order.PaymentMethod === 'Online' || order.PaymentMethod === 'COD') {
    let wallet = await Wallet.findOne({ UserId: order.UserId });
    if (!wallet) {
      wallet = new Wallet({ UserId: order.UserId, Balance: 0, Transaction: [] });

    }
    if (refundAmount > 0) {
      wallet.Balance += refundAmount;
      wallet.Transaction.push({
        TransactionAmount: refundAmount,
        TransactionType: 'credit',
        description: `Refund for returned item ${item.product.productName} in order ${order._id}`,
        TransactionDate: new Date()
      });
      wallet.UpdatedAt = new Date();
      await wallet.save();
    } else {
      console.log(`No refund applied, amount too low: ${refundAmount}`);
    }
  } else {
    console.log(`No wallet update, payment method is ${order.PaymentMethod}`);
  }

  await order.save();
  res.redirect(`/admin/order-details/${orderId}`);
});

const rejectReturn = catchAsync(async (req, res, next) => {
  const { orderId } = req.params;
  const { productId } = req.query;

  const order = await Orders.findById(orderId);
  if (!order) { return res.status(HttpStatus.NOT_FOUND).send('Order not found'); }

  const item = order.Items.find(item => item.product?._id.toString() === productId);
  if (!item) { return res.status(HttpStatus.NOT_FOUND).send('Item not found in order'); }
  if (item.returnStatus !== 'Return Requested') { return res.status(HttpStatus.BAD_REQUEST).send('Item return not requested'); }

  item.returnStatus = 'Request Denied';
  item.status = 'Delivered';
  await order.save();

  res.redirect(`/admin/order-details/${orderId}`);
});

const cancelSingleItem = catchAsync(async (req, res, next) => {
  const { orderId, itemId } = req.params;
  const { reason } = req.body;

  const order = await Orders.findById(orderId).populate('Items.product');
  if (!order || order.Status !== 'Pending') {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Order not found or not in Pending status' });
  }

  const item = order.Items.id(itemId);
  if (!item || item.status === 'Cancelled') {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Item not found or already cancelled' });
  }
  if (item.returnStatus !== 'NotRequested') {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Item with a return request cannot be cancelled' });
  }

  item.status = 'Cancelled';
  item.cancelReason = reason || 'No reason provided';

  const product = item.product;
  const variantIndex = item.variantIndex !== undefined ? item.variantIndex : 0;
  if (product && product.Variants?.[variantIndex]) {
    product.Variants[variantIndex].Stock += item.quantity;
    await product.save();
  }

  const delivery = order.totalDeliveryCharge || 40;

  let refundAmount = item.finalPayableAmount || ((item.originalPrice || item.price || 0) * item.quantity);

  const allItemsCancelled = order.Items.every(i => i.status === 'Cancelled' || i._id.toString() === itemId);
  if (allItemsCancelled) {
    refundAmount += delivery;
  }

  if (order.PaymentMethod === 'Online' && order.PaymentStatus === 'Completed') {
    let wallet = await Wallet.findOne({ UserId: order.UserId });
    if (!wallet) {
      wallet = new Wallet({ UserId: order.UserId, Balance: 0, Transaction: [] });
    }
    wallet.Balance += refundAmount;
    wallet.Transaction.push({
      amount: refundAmount,
      type: 'credit',
      description: `Refund for cancelled item ${item.product?.productName} in order ${order._id}`,
      date: new Date()
    });
    wallet.UpdatedAt = new Date();
    await wallet.save();
  }

  const allCancelled = order.Items.every(i => i.status === 'Cancelled');
  if (allCancelled) {
    order.Status = 'Cancelled';
    order.CancelReason = reason;
  }

  await order.save();
  return res.status(HttpStatus.OK).json({ success: true, message: 'Item cancelled successfully', orderStatus: order.Status });
});

const returnSingleItem = catchAsync(async (req, res, next) => {
  const { orderId, itemId } = req.params;
  const { reason } = req.body;

  const order = await Orders.findById(orderId).populate('Items.product');
  if (!order || order.Status !== 'Delivered') {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Order not found or not in Delivered status' });
  }

  const item = order.Items.id(itemId);
  if (!item) {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Item not found' });
  }
  if (item.status === 'Cancelled') {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Cancelled item cannot be returned' });
  }
  if (item.returnStatus !== 'NotRequested') {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Return already requested or processed' });
  }

  const deliveryDate = order.deliveryDate || new Date();
  const daysSinceDelivery = (new Date() - deliveryDate) / (1000 * 60 * 60 * 24);
  if (daysSinceDelivery > 7) {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Return window has expired' });
  }

  item.returnStatus = 'Return Requested';
  item.returnReason = reason;
  item.returnRequestedAt = new Date();

  await order.save();
  return res.status(HttpStatus.OK).json({ success: true, message: 'Return request for item submitted successfully' });
});

const updateItemStatus = catchAsync(async (req, res, next) => {
  const { orderId, itemId } = req.params;
  const { status } = req.body;

  const validStatuses = ['Pending', 'Shipped', 'OutForDelivery', 'Delivered', 'Cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Invalid status' });
  }

  const order = await Orders.findById(orderId).populate('Items.product');
  if (!order) {
    return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: 'Order not found' });
  }

  const item = order.Items.id(itemId);
  if (!item) {
    return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: 'Item not found' });
  }
  if (item.status === 'Cancelled' || item.status === 'Returned') {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Cannot update status of cancelled or returned item' });
  }
  if (item.returnStatus === 'Return Requested' || item.returnStatus === 'Request Approved') {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Cannot update status of item with active return request' });
  }

  if (status === 'Cancelled') {
    const product = item.product;
    const variantIndex = item.variantIndex !== undefined ? item.variantIndex : 0;
    if (product && product.Variants?.[variantIndex]) {
      product.Variants[variantIndex].Stock += item.quantity;
      await product.save();
    }

    const delivery = order.totalDeliveryCharge || 40;

    let refundAmount = item.finalPayableAmount || ((item.originalPrice || item.price || 0) * item.quantity);

    const allItemsCancelled = order.Items.every(i => i.status === 'Cancelled' || i._id.toString() === itemId);
    if (allItemsCancelled) {
      refundAmount += delivery;
    }

    if (order.PaymentMethod === 'Online' && order.PaymentStatus === 'Completed') {
      let wallet = await Wallet.findOne({ UserId: order.UserId });
      if (!wallet) {
        wallet = new Wallet({ UserId: order.UserId, Balance: 0, Transaction: [] });
      }
      wallet.Balance += refundAmount;
      wallet.Transaction.push({
        amount: refundAmount,
        type: 'credit',
        description: `Refund for cancelled item ${item.product.productName} in order ${order._id}`,
        date: new Date()
      });
      wallet.UpdatedAt = new Date();
      await wallet.save();
    }
  }

  item.status = status;

  const allCancelled = order.Items.every(i => i.status === 'Cancelled');
  if (allCancelled) {
    order.Status = 'Cancelled';
    order.CancelReason = 'All items cancelled by admin';
  }

  await order.save();
  return res.status(HttpStatus.OK).json({ success: true, message: 'Item status updated successfully', orderStatus: order.Status });
});

module.exports = {
  getAdminOrders,
  getOrderDetails,
  approveReturn,
  rejectReturn,
  cancelSingleItem,
  returnSingleItem,
  updateItemStatus
};