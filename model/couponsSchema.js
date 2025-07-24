const mongoose = require('mongoose');
const { Schema } = mongoose;

const CouponsSchema = new Schema({
  UserId: {
    type: Schema.Types.ObjectId,
    ref: 'User',     
    required: false,
  },
  CreatedAt: {
    type: Date,
    default: Date.now,
  },
  UpdatedAt: {
    type: Date,
    default: Date.now,
  },
  MaxCartValue: {
    type: Number,
    required: false,
  },
  MinCartValue: {
    type: Number,
    required: false,
  },
  UsageLimit: {
    type: Number,
    required: true,
  },
  ExpiryDate: {
    type: Date,
    required: true,
  },StartDate : {
    type:String
  },
  CouponName: {
    type: String,
    required: true,
  },
  CouponCode: {
    type: String,
    unique: true,
  },
  IsListed:{
    type:Boolean
  }
});

const Coupons = mongoose.model('Coupons', CouponsSchema);

module.exports = Coupons;
