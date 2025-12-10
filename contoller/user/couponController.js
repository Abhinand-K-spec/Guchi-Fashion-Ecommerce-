const User = require('../../model/userSchema');
const category = require('../../model/categorySchema');
const Products = require('../../model/productSchema');
const Offers = require('../../model/offersSchema');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const Cart = require('../../model/cartSchema');
const Orders = require('../../model/ordersSchema');
const Address = require('../../model/addressSchema');
const Coupon = require('../../model/couponsSchema');
const mongoose = require('mongoose');
const HttpStatus = require('../../config/httpStatus');


const validateCoupon = async (req, res) => {
  try {
    const { couponCode, subtotal } = req.body;
    const cartTotal = parseFloat(subtotal);
    const userId = req.session.user;


    if (!couponCode || isNaN(cartTotal) || cartTotal <= 0 || !userId) {
      console.error('Invalid input:', { couponCode, cartTotal, userId });
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        valid: false,
        message: 'Coupon code, valid cart total, and user ID are required.'
      });
    }



    const coupon = await Coupon.findOne({
      CouponCode: couponCode.trim().toUpperCase(),
      StartDate: { $lte: new Date() },
      ExpiryDate: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      IsListed: true,
      $or: [{ UserId: null }, { UserId: new mongoose.Types.ObjectId(userId) }],
      MinCartValue: { $lte: cartTotal }
    }).lean();

    if (!coupon) {
      console.error('Coupon not found or invalid:', couponCode);
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        valid: false,
        message: 'Invalid or expired coupon.'
      });
    }


    if (!Number.isInteger(coupon.UsageLimit) || coupon.UsageLimit <= 0) {
      console.error('Invalid coupon UsageLimit:', coupon.UsageLimit);
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        valid: false,
        message: 'Coupon has an invalid usage limit.'
      });
    }


    const usageCount = await Orders.countDocuments({ Coupon: coupon._id });
    if (usageCount >= coupon.UsageLimit) {
      console.error('Coupon usage limit reached:', { couponCode, usageCount, limit: coupon.UsageLimit });
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        valid: false,
        message: 'Coupon usage limit reached.'
      });
    }


    const discountPercentage = Number.isFinite(coupon.Discount) ? coupon.Discount : 0;
    if (discountPercentage <= 0 || discountPercentage > 100) {
      console.error('Invalid discount percentage:', discountPercentage);
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        valid: false,
        message: 'Invalid coupon discount percentage.'
      });
    }


    let discountAmount = cartTotal * (discountPercentage / 100);
    if (coupon.MaxDiscount && Number.isFinite(coupon.MaxDiscount)) {
      discountAmount = Math.min(discountAmount, coupon.MaxDiscount);
    }
    discountAmount = Math.round(discountAmount * 100) / 100;


    return res.status(HttpStatus.OK).json({
      success: true,
      valid: true,
      discount: discountPercentage,
      discountAmount,
      couponId: coupon._id.toString(),
      message: 'Coupon applied successfully.'
    });
  } catch (err) {
    console.error('Coupon validation error:', {
      error: err.message,
      couponCode: req.body.couponCode,
      subtotal: req.body.subtotal,
      userId: req.session.user
    });
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      valid: false,
      message: 'Error validating coupon.'
    });
  }
};


module.exports = {
  validateCoupon
};