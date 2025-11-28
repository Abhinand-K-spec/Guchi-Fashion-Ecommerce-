// =========================
// ADMIN ORDER CONTROLLER
// FULLY UPDATED WITH VARIANT SUPPORT (Option C: size-based)
// =========================

const Orders = require('../../model/ordersSchema');
const User = require('../../model/userSchema');
const Product = require('../../model/productSchema');
const Wallet = require('../../model/walletSchema');


// ------------------------------------
// UTIL: Find correct variant by size
// ------------------------------------
function getVariant(product, size) {
  if (!product || !product.Variants) return null;
  return product.Variants.find(v => v.Size === size);
}


// ------------------------------------
// ADMIN — LIST ORDERS WITH SEARCH, FILTER, PAGINATION
// ------------------------------------
const getAdminOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
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

    // COMPUTE ORDER STATUS BASED ON ITEM STATUS
    orders = orders.map(order => {
      const statuses = order.Items.map(i => i.status);
      let computedStatus = "";

      if (order.PaymentStatus === "Pending") computedStatus = "Payment Failed";
      else if (statuses.every(s => s === "Delivered")) computedStatus = "Delivered";
      else if (statuses.every(s => s === "Cancelled")) computedStatus = "Cancelled";
      else if (statuses.every(s => s === "Returned")) computedStatus = "Returned";
      else if (statuses.includes("Delivered") && statuses.includes("Pending")) computedStatus = "Partially Delivered";
      else if (statuses.includes("Returned") && statuses.includes("Delivered")) computedStatus = "Partially Returned";
      else if (statuses.includes("Pending")) computedStatus = "Pending";
      else computedStatus = statuses[0] || "Pending";

      return { ...order, computedStatus };
    });

    if (statusFilter) {
      orders = orders.filter(o => o.computedStatus === statusFilter);
    }

    const totalOrders = orders.length;
    const paginated = orders.slice((page - 1) * limit, page * limit);

    res.render('order-manage', {
      orders: paginated,
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit),
      search,
      status: statusFilter
    });

  } catch (err) {
    console.error('Error loading orders:', err);
    res.status(500).render('page-404');
  }
};


// ------------------------------------
// ADMIN — ORDER DETAILS PAGE
// ------------------------------------
const getOrderDetails = async (req, res) => {
  try {
    const order = await Orders.findById(req.params.orderId)
      .populate('UserId', 'name email')
      .populate('Items.product')
      .lean();

    if (!order) return res.status(404).render('page-404');

    res.render('order-details-manage', { order, activePage: 'order' });
  } catch (err) {
    console.error('Error loading order details:', err);
    res.status(500).render('page-404');
  }
};


// ------------------------------------
// ADMIN — APPROVE RETURN FOR SINGLE ITEM
// ------------------------------------
const approveReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId } = req.query;

    const order = await Orders.findById(orderId).populate('Items.product');
    if (!order) return res.status(404).send('Order not found');

    const item = order.Items.find(i => i.product?._id.toString() === productId);
    if (!item) return res.status(404).send('Item not found');
    if (item.returnStatus !== 'Return Requested')
      return res.status(400).send('Item return not requested');

    const product = item.product;
    const variant = getVariant(product, item.size);
    if (variant) {
      variant.Stock += item.quantity;
      await product.save();
    }

    item.returnStatus = 'Request Approved';
    item.status = 'Returned';

    const tax = (((item.price * item.quantity) * 0.05)) / 100;
    const delivery = 40;
    const refundAmount = item.price * item.quantity + tax - item.itemDiscount + delivery;

    if (refundAmount > 0) {
      let wallet = await Wallet.findOne({ UserId: order.UserId });
      if (!wallet) wallet = new Wallet({ UserId: order.UserId, Balance: 0, Transaction: [] });

      wallet.Balance += refundAmount;
      wallet.Transaction.push({
        TransactionAmount: refundAmount,
        TransactionType: 'credit',
        description: `Refund for returned item in order ${order.OrderId}`,
        TransactionDate: new Date()
      });
      await wallet.save();
    }

    await order.save();
    res.redirect(`/admin/order-details/${orderId}`);

  } catch (err) {
    console.error('Error approving return:', err);
    res.status(500).send('Internal server error');
  }
};


// ------------------------------------
// ADMIN — REJECT RETURN FOR SINGLE ITEM
// ------------------------------------
const rejectReturn = async (req, res) => {
  try {
    const order = await Orders.findById(req.params.orderId);
    if (!order) return res.status(404).send('Order not found');

    const item = order.Items.find(i => i.product?._id.toString() === req.query.productId);
    if (!item) return res.status(404).send('Item not found');

    item.returnStatus = 'Request Denied';
    item.status = 'Delivered';

    await order.save();
    res.redirect(`/admin/order-details/${req.params.orderId}`);

  } catch (err) {
    console.error('Error rejecting return:', err);
    res.status(500).send('Internal server error');
  }
};


// ------------------------------------
// ADMIN — CANCEL SINGLE ITEM
// ------------------------------------
const cancelSingleItem = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { reason } = req.body;

    const order = await Orders.findById(orderId).populate('Items.product');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const item = order.Items.id(itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    if (item.status === 'Cancelled')
      return res.status(400).json({ success: false, message: 'Already cancelled' });

    const product = item.product;
    const variant = getVariant(product, item.size);

    if (variant) {
      variant.Stock += item.quantity;
      await product.save();
    }

    item.status = 'Cancelled';
    item.cancelReason = reason || "Cancelled by admin";

    let refundAmount = item.price * item.quantity;
    if (order.discountAmount > 0) {
      const preDiscountTotal = order.Items.reduce((sum, i) =>
        sum + (i.originalPrice * i.quantity), 0);

      const itemShare = (item.originalPrice * item.quantity) / preDiscountTotal;
      refundAmount -= itemShare * order.discountAmount;
    }

    if (order.PaymentMethod === 'Online' && order.PaymentStatus === 'Completed') {
      let wallet = await Wallet.findOne({ UserId: order.UserId });
      if (!wallet) wallet = new Wallet({ UserId: order.UserId, Balance: 0, Transaction: [] });

      wallet.Balance += refundAmount;
      wallet.Transaction.push({
        TransactionAmount: refundAmount,
        TransactionType: 'credit',
        description: `Refund for cancelled item in order ${order.OrderId}`,
        TransactionDate: new Date()
      });
      await wallet.save();
    }

    const allCancelled = order.Items.every(i => i.status === 'Cancelled');
    if (allCancelled) order.Status = 'Cancelled';

    await order.save();
    return res.json({ success: true, message: 'Item cancelled successfully' });

  } catch (err) {
    console.error('Cancel item error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


// ------------------------------------
// ADMIN — UPDATE ITEM STATUS (Shipped, Delivered, etc.)
// ------------------------------------
const updateItemStatus = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { status } = req.body;

    const validStatuses = ['Pending', 'Shipped', 'OutForDelivery', 'Delivered', 'Cancelled'];
    if (!validStatuses.includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status' });

    const order = await Orders.findById(orderId).populate('Items.product');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const item = order.Items.id(itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    if (item.status === 'Cancelled' || item.status === 'Returned')
      return res.status(400).json({ success: false, message: 'Cannot update cancelled/returned item' });

    item.status = status;

    const allCancelled = order.Items.every(i => i.status === 'Cancelled');
    if (allCancelled) order.Status = 'Cancelled';

    await order.save();
    return res.json({ success: true, message: 'Item status updated' });

  } catch (err) {
    console.error('Update item status error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


// ------------------------------------
// EXPORTS
// ------------------------------------
module.exports = {
  getAdminOrders,
  getOrderDetails,
  approveReturn,
  rejectReturn,
  cancelSingleItem,
  updateItemStatus
};
