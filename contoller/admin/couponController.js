const Coupon = require('../../model/couponsSchema');
const User = require('../../model/userSchema');
const Product = require('../../model/productSchema');
const Order = require('../../model/ordersSchema');

const coupon = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1; 
        const limit = 4; 
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
            Discount,
            UsageLimit,
            StartDate,
            EndDate,
            MinCartValue,
            MaxCartValue,
        } = req.body;

        console.log('Coupon data received:', req.body);


        const existingCoupon = await Coupon.findOne({ CouponCode });
        if (existingCoupon) {
            console.log('Existing coupon found:', existingCoupon);
            return res.status(400).json({ error: 'Coupon code already exists' });
        }


        const start = new Date(StartDate);
        const end = new Date(EndDate);
        if (start > end) {
            return res.status(400).json({ error: 'Start Date cannot be later than End Date' });
        }


        const discountValue = parseFloat(Discount);
        if (isNaN(discountValue) || discountValue < 0 || discountValue > 100) {
            return res.status(400).json({ error: 'Discount must be between 0 and 100' });
        }


        const newCoupon = new Coupon({
            UserId: null,
            CouponName,
            CouponCode: CouponCode.toUpperCase(),
            Discount: discountValue,
            UsageLimit,
            StartDate: start,
            ExpiryDate: end,
            MinCartValue: MinCartValue || 0,
            MaxCartValue: MaxCartValue || null,
            IsListed: true
        });
        // console.log('New coupon to save:', newCoupon);

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
        const coupon = await Coupon.findById(couponId);
        if (!coupon) {
            return res.status(404).json({ error: 'Coupon not found' });
        }
        await Coupon.findByIdAndUpdate(couponId, { IsListed: false });
        res.status(200).json({ message: 'Coupon unlisted successfully' });
    } catch (error) {
        console.error('Error in unlist:', error);
        res.status(500).json({ error: 'Failed to unlist coupon' });
    }
};

const list = async (req, res) => {
    try {
        const couponId = req.params.couponId;
        const coupon = await Coupon.findById(couponId);
        if (!coupon) {
            return res.status(404).json({ error: 'Coupon not found' });
        }
        await Coupon.findByIdAndUpdate(couponId, { IsListed: true });
        res.status(200).json({ message: 'Coupon listed successfully' });
    } catch (error) {
        console.error('Error in list:', error);
        res.status(500).json({ error: 'Failed to list coupon' });
    }
};

// const editCoupon = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const coupon = await Coupon.findById(id);
//         if (!coupon) {
//             return res.status(404).json({ error: 'Coupon not found' });
//         }
//         res.render('editCoupon', { coupon, currentPage: req.query.page || 1 });
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
//             Discount,
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

//         const discountValue = parseFloat(Discount);
//         if (isNaN(discountValue) || discountValue < 0 || discountValue > 100) {
//             return res.status(400).json({ error: 'Discount must be between 0 and 100' });
//         }

//         const updatedCoupon = await Coupon.findByIdAndUpdate(id, {
//             CouponName,
//             CouponCode: CouponCode.toUpperCase(),
//             Discount: discountValue,
//             UsageLimit,
//             StartDate: start,
//             ExpiryDate: end,
//             MinCartValue: MinCartValue || 0,
//             MaxCartValue: MaxCartValue || null,
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