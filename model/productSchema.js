const mongoose = require('mongoose');
const { Schema } = mongoose;


const ProductsSchema = new Schema({
  productName: {
    type: String,
    required: true
  },
  Image: [{
    type: String
   }],
  // Quantity: {
  //   type: Number,
  //   default: 0
  // },
  Rating: {
    type: Number, 
    default: 0
  },
  Brand: {
    type: String
  },
  IsListed: {
    type: Boolean,
    default: true
  },
  Coupon: {
    type: String
  },
  Category: {
    type: Schema.Types.ObjectId, // Usually referenced by ID
    ref: 'Category'
  },
  Description: {
    type: String
  },
  CreatedDate: {
    type: Date,
    default: Date.now
  },
  UpdatedAt: {
    type: Date,
    default: Date.now
  },
  Variants: [{
    Colour: { type: String },
    Image: [{ type: String }],
    OfferPrice: { type: Number },
    Price: { type: Number },
    Size: { type: String },
    Stock: { type: Number }
  }]
});


module.exports = mongoose.model('Product', ProductsSchema); 
