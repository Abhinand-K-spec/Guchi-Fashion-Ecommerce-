const mongoose = require('mongoose');
const { Schema } = mongoose;

const CategorySchema = new Schema({
  categoryName: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  isListed: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true  // Automatically adds createdAt and updatedAt
});

const Category = mongoose.model('Category', CategorySchema);

module.exports = Category; 
