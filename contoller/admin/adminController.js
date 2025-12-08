const User = require('../../model/userSchema');
const bcrypt = require('bcrypt');
const Orders = require('../../model/ordersSchema');
const Products = require('../../model/productSchema');
const Category = require('../../model/categorySchema');
const { last } = require('lodash');

const pageNotFound = async (req, res) => {
  try {
    return res.render('page-404');
  } catch (error) {
    res.redirect('/pageNotFound');
  }
};

const loadLogin = (req, res) => {
  if (req.session.admin) {
    return res.redirect('/admin');
  }
  res.render('admin-login');
};



const loadDashboard = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.render("admin-login");
    }


    const orders = Orders.find().populate("Items.product").lean();
    const lastOrders = await Orders.find({}).sort({ createdAt: -1 }).limit(5)
    const totalOrders = (await orders).length;


    // Calculate total revenue from completed orders
    const [totalsalesPrice] = await Orders.aggregate([
      { $match: { PaymentStatus: "Completed" } },
      {
        $group: {
          _id: null,
          totalPrice: { $sum: "$orderAmount" }
        }
      }
    ]);


    const pendingOrders = await Orders.countDocuments({ "Items.status": "Pending" });
    const deliveredOrders = await Orders.countDocuments({ "Items.status": "Delivered" });
    const cancelledOrders = await Orders.countDocuments({ "Items.status": "Cancelled" });
    const returnedOrders = await Orders.countDocuments({ "Items.status": "Returned" });


    const lowStock = await Products.countDocuments({ "Variants.Stock": { $lte: 10 } });
    const totalProducts = await Products.countDocuments({});
    const totalUsers = await User.countDocuments({});

    /* ======================================
         DATE CALCULATIONS
    ====================================== */

    const today = new Date();


    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - 7);
    thisWeekStart.setHours(0, 0, 0, 0);

    const lastWeekStart = new Date(today);
    lastWeekStart.setDate(today.getDate() - 14);

    const lastWeekEnd = new Date(today);
    lastWeekEnd.setDate(today.getDate() - 7);

    lastWeekStart.setHours(0, 0, 0, 0);
    lastWeekEnd.setHours(0, 0, 0, 0);


    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const thisMonthEnd = new Date(today);

    thisMonthStart.setHours(0, 0, 0, 0);
    thisMonthEnd.setHours(23, 59, 59, 999);

    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    lastMonthStart.setHours(0, 0, 0, 0);
    lastMonthEnd.setHours(23, 59, 59, 999);


    /* ======================================
         WEEKLY (LAST 7 DAYS) → Mon–Sun
    ====================================== */

    const last7StartDate = new Date();
    last7StartDate.setDate(last7StartDate.getDate() - 6);
    last7StartDate.setHours(0, 0, 0, 0);

    let last7DaysMap = {};
    const last7DaysLabels = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(last7StartDate);
      d.setDate(d.getDate() + i);

      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      last7DaysMap[dateKey] = 0;

      const options = { weekday: 'short', day: 'numeric' };
      last7DaysLabels.push(d.toLocaleDateString('en-US', options));
    }

    const last7Agg = await Orders.aggregate([
      {
        $match: {
          OrderDate: { $gte: last7StartDate },
          PaymentStatus: "Completed"
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$OrderDate" } },
          revenue: { $sum: "$orderAmount" }
        }
      }
    ]);


    last7Agg.forEach(entry => {
      const dateKey = entry._id;
      if (last7DaysMap.hasOwnProperty(dateKey)) {
        last7DaysMap[dateKey] += entry.revenue;
      }
    });


    const last7DaysValues = Object.values(last7DaysMap);


    /* ======================================
          MONTHLY → Week1–Week4
    ====================================== */

    function getWeekNumber(date) {
      const firstDay = new Date(date.getFullYear(), 0, 1);
      const pastDays = (date - firstDay) / 86400000;
      return Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
    }

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    const baseWeekNumber = getWeekNumber(monthStart);

    const monthWeekAgg = await Orders.aggregate([
      {
        $match: {
          OrderDate: { $gte: monthStart, $lt: nextMonthStart },
          PaymentStatus: "Completed"
        }
      },
      {
        $group: {
          _id: { week: { $week: "$OrderDate" } },
          revenue: { $sum: "$orderAmount" }
        }
      }
    ]);

    let monthlyWeekValues = [0, 0, 0, 0];
    let monthlyWeekLabels = ["Week 1", "Week 2", "Week 3", "Week 4"];

    monthWeekAgg.forEach(e => {
      let w = e._id.week - baseWeekNumber + 1;
      if (w < 1) {w = 1;}
      if (w > 4) {w = 4;}
      monthlyWeekValues[w - 1] += e.revenue;
    });


    /* ======================================
          YEARLY → Jan to Current Month
    ====================================== */

    const yearStart = new Date(today.getFullYear(), 0, 1);

    const yearlyAgg = await Orders.aggregate([
      {
        $match: {
          OrderDate: { $gte: yearStart },
          PaymentStatus: "Completed"
        }
      },
      {
        $group: {
          _id: { month: { $month: "$OrderDate" } },
          revenue: { $sum: "$orderAmount" }
        }
      },
      { $sort: { "_id.month": 1 } }
    ]);

    const allMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    let yearlyLabels = [];
    let yearlyValues = [];

    for (let i = 0; i <= today.getMonth(); i++) {
      const found = yearlyAgg.find(m => m._id.month === i + 1);
      yearlyLabels.push(allMonths[i]);
      yearlyValues.push(found ? found.revenue : 0);
    }


    /* ======================================
       CATEGORY BASED SALES
    ====================================== */

    const categorySold = await Orders.aggregate([
      { $unwind: "$Items" },
      {
        $lookup: {
          from: "products",
          localField: "Items.product",
          foreignField: "_id",
          as: "productDetails"
        }
      },
      { $unwind: "$productDetails" },
      {
        $lookup: {
          from: "categories",
          localField: "productDetails.Category",
          foreignField: "_id",
          as: "categoryInfo"
        }
      },
      { $unwind: "$categoryInfo" },
      {
        $group: {
          _id: "$categoryInfo.categoryName",
          totalSold: { $sum: "$Items.quantity" }
        }
      },
      { $sort: { totalSold: -1 } }
    ]);

    const categoryLabels = categorySold.map(c => c._id);
    const categoryData = categorySold.map(c => c.totalSold);


    const topProducts = await Orders.aggregate([
      { $unwind: "$Items" },

      // Fetch product details
      {
        $lookup: {
          from: "products",
          localField: "Items.product",
          foreignField: "_id",
          as: "productDetails"
        }
      },
      { $unwind: "$productDetails" },


      {
        $group: {
          _id: "$productDetails._id",
          productName: { $first: "$productDetails.productName" },
          totalSold: { $sum: "$Items.quantity" }
        }
      },

      { $sort: { totalSold: -1 } },

      { $limit: 5 }
    ]);



    res.render("admin", {
      totalOrders,
      lastOrders,
      totalUsers,
      totalRevenue: totalsalesPrice.totalPrice,
      lowStock,
      pendingOrders,
      cancelledOrders,
      deliveredOrders,
      totalProducts,

      last7DaysLabels,
      last7DaysValues,
      monthlyWeekLabels,
      monthlyWeekValues,
      yearlyLabels,
      yearlyValues,

      returnedOrders,
      categoryLabels,
      categoryData,
      topProducts
    });

  } catch (error) {
    console.log("error in dashboard:", error.message);
    res.render("page-404");
  }
};







const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await User.findOne({ email: email, isAdmin: true });

    if (!admin) {
      return res.render('admin-login', { msg: 'Admin not found' });
    }

    if (!admin.password) {
      return res.render('admin-login', { msg: 'Password is missing for this admin' });
    }

    const passwordMatch = await bcrypt.compare(password, admin.password);

    if (passwordMatch) {
      req.session.admin = true;
      return res.redirect('/admin');
    } else {
      return res.render('admin-login', { msg: 'Password not matching' });
    }

  } catch (error) {
    console.error('Error during admin login:', error);
    res.status(500).render('page-404');
  }
};

const logout = async (req, res) => {
  try {

    delete req.session.admin;
    res.redirect('/admin/login');

  } catch (error) {
    console.log('error destroying admin session');
    res.render('page-404');
  }
};


const loadUsers = async (req, res) => {
  res.render('users');
};


module.exports = {
  loadLogin,
  loadDashboard,
  login,
  logout,
  loadUsers,
  pageNotFound
};