const mongoose = require('mongoose');

const offersSchema = new mongoose.Schema({
  Category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: false, default: null },
  Product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: false, default: null },
  OfferName: { type: String, required: true },
  StartDate: { type: Date, required: true },
  EndDate: { type: Date, required: true },
  Discount: { type: Number, required: true },
  MinPrice: { type: Number, default: null },
  MaxPrice: { type: Number, default: null }
}, {
  validate: {
    validator: function (v) {
      return (this.Category || this.Product) && !(this.Category && this.Product);
    },
    message: 'An offer must be associated with either a Category or a Product, but not both.'
  }
});

module.exports = mongoose.model('Offers', offersSchema);