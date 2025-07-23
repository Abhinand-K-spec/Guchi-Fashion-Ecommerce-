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
  },paymentMethod:{
    type: String
  },
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
      price: {
        type: Number,
        default: 0
      },
      status: {
        type: String,
        enum: ['Pending','Returned','Delivered','Cancelled','Shipped','OutForDelivery'],
        default: 'Pending' // Tracks 'Confirmed', 'Cancelled', or 'Return Requested'
      },
      cancelReason: {
        type: String // Reason for item cancellation
      },
      returnReason: {
        type: String // Reason for item return
      },
     
      returnStatus: {
        type: String,
        enum: ['NotRequested', 'Return Requested', 'Request Approved', 'Request Denied'],
        default: 'NotRequested'
      },
      returnRequestedAt: {
        type: Date // Timestamp for return request
      }
    }
  ],
  OrderId: {
    type: String // Readable string like 'ORD123456'
  },
  OrderDate: {
    type: Date,
    default: Date.now
  },
  CancelReason: {
    type: String
  },
  returnStatus: {
    type: String // Added to track overall order return status (e.g., 'Pending')
  },
  ReturnReason: {
    type: String
  },
  ReturnRequestedAt: {
    type: Date
  }
}, {
  timestamps: true // adds createdAt and updatedAt automatically
});

const Orders = mongoose.model('Orders', OrdersSchema);
module.exports = Orders;