const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  CouponCode: { type: String, required: true, unique: true, uppercase: true },
  CouponName: { type: String, required: true },
  Discount: { type: Number, required: true, min: 0, max: 100 },
  MinCartValue: { type: Number, default: 0 },
  MaxCartValue: { type: Number, default: null },
  StartDate: { type: Date, required: true },
  ExpiryDate: { type: Date, required: true },
  IsListed: { type: Boolean, default: true },
  UserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  UsageLimit: { type: Number, default: 1 },
  UsedBy: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    usageCount: { type: Number, default: 0 }
  }],
  CreatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Coupon', couponSchema);