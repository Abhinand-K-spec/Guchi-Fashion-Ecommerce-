const mongoose = require('mongoose');
const { Schema } = mongoose;

const OffersSchema = new Schema({
  Category: {
    type: Schema.Types.ObjectId,
    ref: 'Category',
    required: true,
  },
  OfferName: {
    type: String,
    required: true,
  },
  StartDate: {
    type: Date,
    required: true,
  },
  EndDate: {
    type: Date,
    required: true,
  },
  Discount: {
    type: Number,
    required: true,
    min: 0,
  },
  MinPrice: {
    type: Number,
    required: false,
    min: 0,
  },
  MaxPrice: {
    type: Number,
    required: false,
    min: 0,
  },
});

const Offers = mongoose.model('Offers', OffersSchema);

module.exports = Offers;
