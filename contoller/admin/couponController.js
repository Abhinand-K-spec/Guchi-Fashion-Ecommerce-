const Coupon = require('../../model/couponsSchema');
const User = require('../../model/userSchema');
const Product = require('../../model/productSchema');
const Order = require('../../model/ordersSchema');

const coupon = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1; 
        const limit = 5; 
        const skip = (page - 1) * limit;

        const coupons = await Coupon.find().sort({CreatedAt:-1})
            .skip(skip)
            .limit(limit);

        const totalCoupons = await Coupon.countDocuments();
        const totalPages = Math.ceil(totalCoupons / limit);

        res.render('addCoupon', { 
            coupons,
            currentPage: page,
            totalPages,
            hasPrevPage: page > 1,
            hasNextPage: page < totalPages
        });
    } catch (error) {
        console.error('Error in coupon:', error);
        res.render('page-404');
    }
};

const addCoupon = async (req, res) => {
    try {
        const userId = req.session.user;

        const {
            CouponName,
            CouponCode,
            UsageLimit,
            StartDate,
            EndDate,
            MinCartValue,
            MaxCartValue,
        } = req.body;

        console.log('coupon code of coupon :',req.body.CouponCode)

        // Check if coupon code already exists
        const existingCoupon = await Coupon.findOne({ CouponCode });
        if (existingCoupon) {
            console.log('checking existing coupon:',Coupon.findOne({ CouponCode }))
            return res.status(400).json({ error: 'Coupon code already exists' });
        }

        // Validate dates
        const start = new Date(StartDate);
        const end = new Date(EndDate);
        if (start > end) {
            return res.status(400).json({ error: 'Start Date cannot be later than End Date' });
        }

        // Create new coupon
        const newCoupon = new Coupon({
            UserId: userId || null,
            CouponName,
            CouponCode,
            UsageLimit,
            StartDate: start,
            ExpiryDate: end,
            MinCartValue,
            MaxCartValue,
            IsListed: true // Default to listed for new coupons
        });
        console.log(newCoupon)

        await newCoupon.save();
        res.redirect('/admin/coupons?page=1'); 
    } catch (error) {
        console.error('Error in addCoupon:', error);
        res.render('page-404');
    }
};




const unlist = async (req, res) => {
  try {
    const couponId = req.params.couponId;
    await Coupon.findByIdAndUpdate(couponId, { IsListed: false });
    res.redirect('/admin/coupon');
  } catch (error) {
    console.error('Error in unlist:', error);
    res.redirect('/page-404');
  }
};

const list = async (req, res) => {
  try {
    const couponId = req.params.couponId;
    await Coupon.findByIdAndUpdate(couponId, { IsListed: true });
    res.redirect('/admin/coupon');
  } catch (error) {
    console.error('Error in list:', error);
    res.redirect('/page-404');
  }
};



// const editCoupon = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const coupon = await Coupon.findById(id);
//         if (!coupon) {
//             return res.status(404).json({ error: 'Coupon not found' });
//         }
//         res.render('editCoupon', { coupon }); // Assume editCoupon.ejsexists for editing
//     } catch (error) {
//         console.error('Error in editCoupon:', error);
//         res.render('page-404');
//     }
// };

// const updateCoupon = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const {
//             CouponName,
//             CouponCode,
//             UsageLimit,
//             StartDate,
//             EndDate,
//             MinCartValue,
//             MaxCartValue,
//         } = req.body;

//         const start = new Date(StartDate);
//         const end = new Date(EndDate);
//         if (start > end) {
//             return res.status(400).json({ error: 'Start Date cannot be later than End Date' });
//         }

//         const updatedCoupon = await Coupon.findByIdAndUpdate(id, {
//             CouponName,
//             CouponCode,
//             UsageLimit,
//             StartDate: start,
//             EndDate: end,
//             MinCartValue,
//             MaxCartValue,
//         }, { new: true, runValidators: true });

//         if (!updatedCoupon) {
//             return res.status(404).json({ error: 'Coupon not found' });
//         }
//         res.redirect(`/admin/coupons?page=${req.query.page || 1}`);
//     } catch (error) {
//         console.error('Error in updateCoupon:', error);
//         res.render('page-404');
//     }
// };

module.exports = {
    coupon,
    addCoupon,
    // editCoupon,
    // updateCoupon,
    unlist,
    list
};