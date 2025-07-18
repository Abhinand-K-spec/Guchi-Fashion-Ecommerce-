const mongoose = require('mongoose');
const { Schema } = mongoose;

const ReviewsSchema = new Schema({
  UserId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  ProductId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  Rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  Feedback: {
    type: String,
    required: false,
    trim: true,
  },
}, { timestamps: true });  
const Reviews = mongoose.model('Reviews', ReviewsSchema);

module.exports = Reviews;
