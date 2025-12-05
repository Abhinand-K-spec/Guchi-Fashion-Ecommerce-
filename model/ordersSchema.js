const mongoose = require('mongoose');
const { Schema } = mongoose;

const OrdersSchema = new Schema({
  UserId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  PaymentId: {
    type: Schema.Types.ObjectId,
    ref: 'Payment'
  },
  PaymentMethod: {
    type: String,
    enum: ['Online', 'COD', 'Wallet'],
    required: true
  },
  PaymentStatus: {
    type: String,
    enum: ['Completed', 'Pending', 'Failed']
  },
  addressId: { type: mongoose.Schema.Types.ObjectId, ref: 'address' },
  Address: {
    name: String,
    phone: String,
    alternativePhone: String,
    line1: String,
    town: String,
    city: String,
    state: String,
    postCode: String
  },
  Status: {
    type: String,
    default: 'Pending'
  },
  Items: [
    {
      product: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
      },
      quantity: {
        type: Number,
        required: true
      },
      originalPrice: {
        type: Number,
        default: 0
      },
      offerDiscountAmount: {
        type: Number,
        default: 0
      },
      couponDiscountAmount: {
        type: Number,
        default: 0
      },
      taxAmount: {
        type: Number,
        default: 0
      },
      finalPayableAmount: {
        type: Number,
        default: 0
      },
      status: {
        type: String,
        enum: ['Pending', 'Returned', 'Delivered', 'Cancelled', 'Shipped', 'OutForDelivery'],
        default: 'Pending'
      },
      cancelReason: {
        type: String
      },
      returnReason: {
        type: String
      },
      returnStatus: {
        type: String,
        enum: ['NotRequested', 'Return Requested', 'Request Approved', 'Request Denied'],
        default: 'NotRequested'
      },
      returnRequestedAt: {
        type: Date
      },
      variantIndex: {
        type: Number,
        default: 0
      }
    }
  ],
  OrderId: {
    type: String
  },
  OrderDate: {
    type: Date,
    default: Date.now
  },
  orderAmount: {
    type: Number,
    default: 0
  },
  totalDeliveryCharge: {
    type: Number,
    default: 40
  },
  totalTax: {
    type: Number,
    default: 0
  },
  totalOfferDiscount: {
    type: Number,
    default: 0
  },
  totalCouponDiscount: {
    type: Number,
    default: 0
  },
  CancelReason: {
    type: String
  },
  returnStatus: {
    type: String
  },
  ReturnReason: {
    type: String
  },
  ReturnRequestedAt: {
    type: Date
  }
}, {
  timestamps: true
});

const Orders = mongoose.model('Orders', OrdersSchema);
module.exports = Orders;