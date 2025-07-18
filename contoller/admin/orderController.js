const Orders = require('../../model/ordersSchema');
const User = require('../../model/userSchema');
const Product = require('../../model/productSchema');

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
    if (statusFilter) {
      filter.Status = statusFilter;
    }

    const totalOrders = await Orders.countDocuments(filter);
    const orders = await Orders.find(filter)
      .sort({ createdAt: -1 })
      .populate('UserId', 'name email')
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.render('order-manage', {
      orders,
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit),
      search,
      status: statusFilter,
    });
  } catch (err) {
    console.error('Error loading orders:', err);
    res.status(500).render('page-404');
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Orders.findById(orderId)
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

const approveReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId } = req.query;

    const order = await Orders.findById(orderId).populate('Items.product');
    if (!order) return res.status(404).send('Order not found');

    const item = order.Items.find(item => item.product?._id.toString() === productId);
    if (!item) return res.status(404).send('Item not found in order');
    if (item.returnStatus !== 'Return Requested') return res.status(400).send('Item return not requested');

    await Product.updateOne(
      { _id: item.product, 'Variants.0': { $exists: true } },
      { $inc: { 'Variants.0.Stock': item.quantity } }
    );

    item.returnStatus = 'Request Approved';
    item.status = 'Returned';
    await order.save();

    res.redirect(`/admin/order-details/${orderId}`);
  } catch (err) {
    console.error('Error approving return:', err);
    res.status(500).send('Internal server error');
  }
};

const rejectReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId } = req.query;

    const order = await Orders.findById(orderId);
    if (!order) return res.status(404).send('Order not found');

    const item = order.Items.find(item => item.product?._id.toString() === productId);
    if (!item) return res.status(404).send('Item not found in order');
    if (item.returnStatus !== 'Return Requested') return res.status(400).send('Item return not requested');

    item.returnStatus = 'Request Denied';
    item.status = 'Delivered';
    await order.save();

    res.redirect(`/admin/order-details/${orderId}`);
  } catch (err) {
    console.error('Error rejecting return:', err);
    res.status(500).send('Internal server error');
  }
};

const cancelSingleItem = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { reason } = req.body;

    const order = await Orders.findById(orderId).populate('Items.product');
    if (!order || order.Status !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Order not found or not in Pending status' });
    }

    const item = order.Items.id(itemId);
    if (!item || item.status === 'Cancelled') {
      return res.status(400).json({ success: false, message: 'Item not found or already cancelled' });
    }
    if (item.returnStatus !== 'NotRequested') {
      return res.status(400).json({ success: false, message: 'Item with a return request cannot be cancelled' });
    }

    item.status = 'Cancelled';
    item.cancelReason = reason || 'No reason provided';

    const product = item.product;
    if (product && product.Variants?.[0]) {
      product.Variants[0].Stock += item.quantity;
      await product.save();
    }

    const allCancelled = order.Items.every(i => i.status === 'Cancelled');
    if (allCancelled) {
      order.Status = 'Cancelled';
      order.CancelReason = reason;
    }

    await order.save();
    return res.json({ success: true, message: 'Item cancelled successfully', orderStatus: order.Status });
  } catch (err) {
    console.error("Cancel Single Item Error:", err);
    return res.status(500).json({ success: false, message: 'An error occurred while cancelling the item' });
  }
};

const returnSingleItem = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { reason } = req.body;

    const order = await Orders.findById(orderId).populate('Items.product');
    if (!order || order.Status !== 'Delivered') {
      return res.status(400).json({ success: false, message: 'Order not found or not in Delivered status' });
    }

    const item = order.Items.id(itemId);
    if (!item) {
      return res.status(400).json({ success: false, message: 'Item not found' });
    }
    if (item.status === 'Cancelled') {
      return res.status(400).json({ success: false, message: 'Cancelled item cannot be returned' });
    }
    if (item.returnStatus !== 'NotRequested') {
      return res.status(400).json({ success: false, message: 'Return already requested or processed' });
    }

    const deliveryDate = order.deliveryDate || new Date();
    const daysSinceDelivery = (new Date() - deliveryDate) / (1000 * 60 * 60 * 24);
    if (daysSinceDelivery > 7) {
      return res.status(400).json({ success: false, message: 'Return window has expired' });
    }

    item.returnStatus = 'Return Requested';
    item.returnReason = reason;
    item.returnRequestedAt = new Date();

    await order.save();
    return res.json({ success: true, message: 'Return request for item submitted successfully' });
  } catch (err) {
    console.error('Return Single Item Error:', err);
    return res.status(500).json({ success: false, message: 'An error occurred while requesting return for the item' });
  }
};

const updateItemStatus = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { status } = req.body;

    const validStatuses = ['Pending', 'Shipped', 'OutForDelivery', 'Delivered', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const order = await Orders.findById(orderId).populate('Items.product');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const item = order.Items.id(itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }
    if (item.status === 'Cancelled' || item.status === 'Returned') {
      return res.status(400).json({ success: false, message: 'Cannot update status of cancelled or returned item' });
    }
    if (item.returnStatus === 'Return Requested' || item.returnStatus === 'Request Approved') {
      return res.status(400).json({ success: false, message: 'Cannot update status of item with active return request' });
    }

    if (status === 'Cancelled') {
      const product = item.product;
      if (product && product.Variants?.[0]) {
        product.Variants[0].Stock += item.quantity;
        await product.save();
      }
    }

    item.status = status;

    const allCancelled = order.Items.every(i => i.status === 'Cancelled');
    if (allCancelled) {
      order.Status = 'Cancelled';
      order.CancelReason = 'All items cancelled by admin';
    }

    await order.save();
    return res.json({ success: true, message: 'Item status updated successfully', orderStatus: order.Status });
  } catch (err) {
    console.error('Error updating item status:', err);
    return res.status(500).json({ success: false, message: 'An error occurred while updating the item status' });
  }
};

module.exports = {
  getAdminOrders,
  getOrderDetails,
  approveReturn,
  rejectReturn,
  cancelSingleItem,
  returnSingleItem,
  updateItemStatus
};