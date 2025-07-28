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
  PaymentMethod:{
    type:String,
    enum:['Online','COD','Wallet'],
    required:true
  },
  PaymentStatus:{
    type:String
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
      price: {
        type: Number,
        default: 0
      },
      status: {
        type: String,
        enum: ['Pending','Returned','Delivered','Cancelled','Shipped','OutForDelivery'],
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