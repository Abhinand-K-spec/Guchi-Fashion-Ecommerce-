const { type } = require('express/lib/response');
const mongoose = require('mongoose');

const { Schema, ObjectId } = mongoose;

const WishlistSchema = new Schema({
  UserId:{type:Schema.Types.ObjectId,ref:'User'},
  ProductId: { type: Schema.Types.ObjectId,ref: 'Product',required: true },
  UpdatedAt: { type: Date,default: Date.now },
  CreatedAt: { type: Date,default: Date.now },
});

const Wishlist = mongoose.model('Wishlist', WishlistSchema);

module.exports = Wishlist;

