const mongoose = require('mongoose');

const { Schema } = mongoose;

const PaymentSchema = new Schema({
  createdAt: {
    type: Date,
    default: Date.now,  
  },
  amount: {
    type: Number,
    required: true,     
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'], // Restrict values
    required: true,
  },
  method: {
    type: String,
    enum: ['card', 'upi', 'netbanking', 'wallet', 'cod'], // Example methods
    required: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',        
    required: true,
  },
  transactionId: {
    type: String,        
    required: true,
    unique: true,
  },
}, {
  timestamps: true,      // Automatically adds createdAt and updatedAt
});

const Payment = mongoose.model('Payment', PaymentSchema);

module.exports = Payment; 