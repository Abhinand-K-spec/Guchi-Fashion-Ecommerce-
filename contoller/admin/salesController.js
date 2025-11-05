const Orders = require('../../model/ordersSchema');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const getSalesReport = async (req, res) => {
  try {
    const { period, range, startDate, endDate } = req.query;

    let filter = {};
    const now = new Date();
    now.setHours(23, 59, 59, 999);

    if (period === 'custom' && startDate && endDate) {
      filter.OrderDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      let startDateFilter;
      switch (range) {
        case '1day':
          startDateFilter = new Date(now);
          startDateFilter.setDate(now.getDate() - 1);
          break;
        case '1week':
          startDateFilter = new Date(now);
          startDateFilter.setDate(now.getDate() - 7);
          break;
        case '1month':
          startDateFilter = new Date(now);
          startDateFilter.setMonth(now.getMonth() - 1);
          break;
        default:
          startDateFilter = new Date(now);
          startDateFilter.setDate(now.getDate() - 1);
      }
      filter.OrderDate = { $gte: startDateFilter, $lte: now };
    }

    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const orders = await Orders.find(filter)
      .populate('UserId', 'name')
      .sort({ OrderDate: -1 })
      .lean();
    const paginatedOrders = orders.slice(startIndex, endIndex);

    const report = paginatedOrders.map(order => {
      const totalAmount = order.Items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const totalItemDiscount = order.Items.reduce((sum, item) => sum + (item.itemDiscount || 0), 0);
      const couponDiscount = order.discountAmount ? (order.discountAmount - totalItemDiscount) : 0;

      return {
        OrderId: order.OrderId,
        OrderDate: order.OrderDate,
        UserId: order.UserId,
        TotalAmount: totalAmount,
        Discount: totalItemDiscount,
        CouponDiscount: couponDiscount,
        NetAmount: totalAmount - totalItemDiscount - couponDiscount
      };
    });

    const overallSalesCount = orders.length;
    const overallOrderAmount = orders.reduce((sum, order) => sum + order.Items.reduce((itemSum, item) => itemSum + (item.price * item.quantity), 0), 0);
    const overallDiscount = orders.reduce((sum, order) => sum + (order.discountAmount || 0), 0);

    res.render('sales', {
      period: period || 'daily',
      range: range || '1day',
      startDate: startDate || '',
      endDate: endDate || '',
      report,
      overallSalesCount,
      overallOrderAmount,
      overallDiscount,
      currentPage: page,
      totalPages: Math.ceil(orders.length / limit)
    });
  } catch (err) {
    console.error('Error generating sales report:', err);
    res.status(500).render('page-404');
  }
};

const downloadSalesReport = async (req, res) => {
  try {
    const { period, range, startDate, endDate } = req.query;
    const startTime = new Date().toISOString();


    let filter = {};
    const now = new Date();
    now.setHours(23, 59, 59, 999); 

    if (period === 'custom' && startDate && endDate) {
      filter.OrderDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      let startDateFilter;
      switch (range) {
        case '1day':
          startDateFilter = new Date(now);
          startDateFilter.setDate(now.getDate() - 1);
          break;
        case '1week':
          startDateFilter = new Date(now);
          startDateFilter.setDate(now.getDate() - 7);
          break;
        case '1month':
          startDateFilter = new Date(now);
          startDateFilter.setMonth(now.getMonth() - 1);
          break;
        default:
          startDateFilter = new Date(now);
          startDateFilter.setDate(now.getDate() - 1);
      }
      filter.OrderDate = { $gte: startDateFilter, $lte: now };
    }

    const orders = await Orders.find(filter)
      .populate('UserId', 'name')
      .sort({ OrderDate: -1 })
      .lean();



    const doc = new PDFDocument({ margin: 50, size: 'A4', autoFirstPage: false });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="sales-report-${Date.now()}.pdf"`);
    doc.pipe(res);



    // Add content
    doc.addPage();
    const logoPath = path.join(__dirname, '../../public/guchi-logo.png');
    if (fs.existsSync(logoPath)) {
      try {
        doc.image(logoPath, 50, 30, { width: 60 });
      } catch (imgErr) {
        console.error('Error loading logo:', imgErr);
      }
    } else {
      console.warn('Logo not found at:', logoPath);
    }

    doc.fontSize(16)
      .text('Guchi Men\'s Fashion', 160, 40, { align: 'center' })
      .moveDown(2);

    doc.fontSize(10)
      .text(`Period: ${period === 'custom' ? `${startDate} to ${endDate}` : `${range} from ${new Date(filter.OrderDate.$gte).toLocaleDateString()} to ${now.toLocaleDateString()}`}`, { align: 'left' })
      .moveDown(1);

    const columns = {
      orderId: 50,
      date: 150,
      customer: 240,
      amount: 330,
      discount: 420,
      netAmount: 500 // Adjusted to fit within page width
    };
    const columnWidth = 80; // Reduced to prevent overflow

    // Debug: Log column positions


    doc.font('Helvetica-Bold')
      .fontSize(10)
      .text('Order ID', columns.orderId, 120, { width: columnWidth, align: 'left' })
      .text('Date', columns.date, 120, { width: columnWidth, align: 'center' })
      .text('Customer', columns.customer, 120, { width: columnWidth, align: 'center' })
      .text('Amount', columns.amount, 120, { width: columnWidth, align: 'center' })
      .text('Discount', columns.discount, 120, { width: columnWidth, align: 'center' })
      .text('Net Amount', columns.netAmount, 120, { width: columnWidth, align: 'center' });

    let y = 140;
    for (const order of orders) {
      try {
        const totalAmount = order.Items?.reduce((sum, item) => sum + (item.price * (item.quantity || 0) || 0), 0) || 0;
        const totalItemDiscount = order.Items?.reduce((sum, item) => sum + (item.itemDiscount || 0), 0) || 0;
        const couponDiscount = order.couponDiscount || 0;
        const netAmount = totalAmount - totalItemDiscount;

        if (!order.OrderId || !order.OrderDate || !order.Items) {
          console.warn('Skipping invalid order:', order._id);
          continue;
        }

        // Extract last 4 characters of OrderId and add prefix
        const orderIdStr = order.OrderId ? String(order.OrderId) : '';
        const lastFourChars = orderIdStr.length >= 4 ? orderIdStr.slice(-4) : orderIdStr.padStart(4, '0');
        const displayOrderId = `ORD-${lastFourChars}`;

        doc.font('Helvetica')
          .fontSize(10)
          .text(displayOrderId || 'N/A', columns.orderId, y, { width: columnWidth, align: 'left' })
          .text(new Date(order.OrderDate).toLocaleDateString(), columns.date, y, { width: columnWidth, align: 'center' })
          .text((order.UserId?.name || 'Unknown').slice(0, 15), columns.customer, y, { width: columnWidth, align: 'center' })
          .text(`₹${totalAmount.toFixed(2)}`, columns.amount, y, { width: columnWidth, align: 'center' })
          .text(`₹${(totalItemDiscount - couponDiscount).toFixed(2)}`, columns.discount, y, { width: columnWidth, align: 'center' })
          .text(`₹${netAmount.toFixed(2)}`, columns.netAmount, y, { width: columnWidth, align: 'center' });

        y += 20;

        if (y > 750) {
          doc.addPage();
          y = 50;
          doc.font('Helvetica-Bold')
            .fontSize(10)
            .text('Order ID', columns.orderId, y, { width: columnWidth, align: 'left' })
            .text('Date', columns.date, y, { width: columnWidth, align: 'center' })
            .text('Customer', columns.customer, y, { width: columnWidth, align: 'center' })
            .text('Amount', columns.amount, y, { width: columnWidth, align: 'center' })
            .text('Discount', columns.discount, y, { width: columnWidth, align: 'center' })
            .text('Net Amount', columns.netAmount, y, { width: columnWidth, align: 'center' });
          y += 20;
        }
      } catch (orderErr) {
        console.error('Error processing order:', order._id, orderErr);
        continue;
      }
    }

    const overallOrderAmount = orders.reduce((sum, order) => sum + (order.Items?.reduce((itemSum, item) => itemSum + (item.price * (item.quantity || 0) || 0), 0) || 0), 0);
    const overallDiscount = orders.reduce((sum, order) => sum + (order.discountAmount || 0), 0);

    doc.moveDown(1)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(`Overall Sales Count: ${orders.length}`, 50, y)
      .text(`Overall Order Amount: ₹${overallOrderAmount.toFixed(2)}`, 50, y + 20)
      .text(`Overall Discount: ₹${overallDiscount.toFixed(2)}`, 50, y + 40);

    doc.on('end', () => {


    });
    doc.end();

  } catch (err) {
    console.error('Critical error downloading sales report:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Error generating PDF report. Check server logs for details.' });
    } else {
      doc?.end(); // Safely end if headers sent
      writeStream?.end();
      res.end();
    }
  }
};

module.exports = {
  getSalesReport,
  downloadSalesReport
};