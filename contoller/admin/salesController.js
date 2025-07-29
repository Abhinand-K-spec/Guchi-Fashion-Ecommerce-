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

    // Pagination parameters
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
      const discount = 0; 
      const couponDiscount = 0; 

      return {
        OrderId: order.OrderId,
        OrderDate: order.OrderDate,
        UserId: order.UserId,
        TotalAmount: totalAmount,
        Discount: discount,
        CouponDiscount: couponDiscount
      };
    });

    const overallSalesCount = orders.length;
    const overallOrderAmount = orders.reduce((sum, order) => sum + order.Items.reduce((itemSum, item) => itemSum + (item.price * item.quantity), 0), 0);
    const overallDiscount = 0; 

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

    // Define filter based on period and range
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

    // Fetch orders and sort by OrderDate descending
    const orders = await Orders.find(filter)
      .populate('UserId', 'name')
      .sort({ OrderDate: -1 }) // Sort by OrderDate descending
      .lean();

    // Generate PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="sales-report-${Date.now()}.pdf"`);

    doc.pipe(res);

    // Add logo and branding
    const logoPath = path.join(__dirname, '../../public/guchi-logo.png'); 
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 30, { width: 60 });
    }
    doc.fontSize(16) 
      .text('Guchi Men\'s Fashion', 160, 40, { align: 'center' })
      .moveDown(2);

    // Add period information
    doc.fontSize(10) 
      .text(`Period: ${period === 'custom' ? `${startDate} to ${endDate}` : `${range} from ${new Date(filter.OrderDate.$gte).toLocaleDateString()} to ${now.toLocaleDateString()}`}`, { align: 'left' })
      .moveDown(1);

    // Define column widths and positions (reduced width)
    const columns = {
      orderId: 50,
      date: 130,
      customer: 210,
      amount: 290,
      netAmount: 370
    };
    const columnWidth = 80; 

    // Table header
    doc.font('Helvetica-Bold')
      .text('OrderId', columns.orderId, 120, { width: columnWidth, align: 'left' }) 
      .text('Date', columns.date, 120, { width: columnWidth, align: 'center' })
      .text('Customer', columns.customer, 120, { width: columnWidth, align: 'center' })
      .text('Amount', columns.amount, 120, { width: columnWidth, align: 'center' })
      .text('Net Amount', columns.netAmount, 120, { width: columnWidth, align: 'center' });

    let y = 140;
    orders.forEach(order => {
      const totalAmount = order.Items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const totalItemDiscount = order.Items.reduce((sum, item) => sum + (item.ItemDiscount || 0), 0);
      const totalCouponDiscount = order.TotalCouponDiscount || 0;
      const discount = totalItemDiscount + totalCouponDiscount;
      const netAmount = totalAmount - discount;

      // Add row data with alignment and truncation, showing first 8 chars of OrderId
      doc.font('Helvetica')
        .text(`${order.OrderId?.slice(0, 8) || 'N/A'}`, columns.orderId, y, { width: columnWidth, align: 'left' })
        .text(new Date(order.OrderDate).toLocaleDateString(), columns.date, y, { width: columnWidth, align: 'center' })
        .text((order.UserId?.name || 'Unknown').slice(0, 15), columns.customer, y, { width: columnWidth, align: 'center' })
        .text(`₹${totalAmount.toFixed(2)}`, columns.amount, y, { width: columnWidth, align: 'center' })
        .text(`₹${netAmount.toFixed(2)}`, columns.netAmount, y, { width: columnWidth, align: 'center' });

      y += 20;

      // Check if we need to move to a new page
      if (y > 750) { 
        doc.addPage();
        y = 50; 

        // Redraw header and lines on new page
        doc.font('Helvetica-Bold')
          .text('OrderId', columns.orderId, y, { width: columnWidth, align: 'left' })
          .text('Date', columns.date, y, { width: columnWidth, align: 'center' })
          .text('Customer', columns.customer, y, { width: columnWidth, align: 'center' })
          .text('Amount', columns.amount, y, { width: columnWidth, align: 'center' })
          .text('Net Amount', columns.netAmount, y, { width: columnWidth, align: 'center' });

        y += 20;
      }
    });

    // Add summary on the last page
    doc.moveDown(1)
      .font('Helvetica-Bold')
      .fontSize(10) 
      .text(`Overall Sales Count: ${orders.length}`, 50, y)
      .text(`Overall Order Amount: ₹${orders.reduce((sum, order) => sum + order.Items.reduce((itemSum, item) => itemSum + (item.price * item.quantity), 0), 0).toFixed(2)}`, 50, y + 20)
      .text(`Overall Discount: ₹${orders.reduce((sum, order) => sum + (order.TotalItemDiscount || 0) + (order.TotalCouponDiscount || 0), 0).toFixed(2)}`, 50, y + 40);

    doc.end();
  } catch (err) {
    console.error('Error downloading sales report:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Error generating PDF report.' });
    } else {
      doc.end(); // Ensure stream is closed if headers are sent
      res.end();
    }
  }
};


module.exports = {
  getSalesReport,
  downloadSalesReport
};