const mongoose = require('mongoose');

const { Schema, ObjectId } = mongoose;

const WishlistSchema = new Schema({
  ProductId: { type: Schema.Types.ObjectId },
  UpdatedAt: { type: Date },
  CreatedAt: { type: Date },
});

const Wishlist = mongoose.model('Wishlist', WishlistSchema);

module.exports = Wishlist;

