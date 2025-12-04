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


        
        const existingCoupon = await Coupon.findOne({ CouponCode });
        if (existingCoupon) {
            return res.status(400).json({
                error: "Coupon code already exists"
            });
            
        }

        const now = new Date();
        const start = new Date(StartDate);
        const end = new Date(EndDate);
        if (start > end) {
            return res.status(400).json({ 
              success: false, 
              error: 'Start Date cannot be later than End Date' 
            });
          }

          if (now > end) {
            return res.status(400).json({ 
              success: false, 
              error: 'End Date cannot be earlier than today Date' 
            });
          }

        const discountValue = parseFloat(Discount);
        if (isNaN(discountValue) || discountValue < 0 || discountValue > 90) {
            return res.status(400).json({ success: false, error: 'Discount must be between 0 and 90' });
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



        const savedCoupon = await newCoupon.save();
        

        res.status(201).json({ success: true, coupon: savedCoupon });
    } catch (error) {
        console.error('Error in addCoupon:', error);
        res.status(500).json({ success: false, error: 'Failed to create coupon' });
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



module.exports = {
    coupon,
    addCoupon,
    unlist,
    list
};