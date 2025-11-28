// model/cartSchema.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const cartSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  Items: [
    {
      product: { type: Schema.Types.ObjectId, ref: 'Product' },
      quantity: { type: Number, required: true, default: 1 },
      size:{type:String}
    },
  ],
}, { timestamps: true });

module.exports = mongoose.model('Cart', cartSchema);
