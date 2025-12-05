const mongoose = require('mongoose');
const { Schema } = mongoose;

const WalletSchema = new Schema({
  UserId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  CreatedAt: {
    type: Date,
    default: Date.now,
  },
  AddedAccount: {
    type: Number,
    default: 0,
  },
  Transaction: [{
    TransactionAmount: {
      type: Number,
      required: true,
    },
    TransactionType: {
      type: String,
      enum: ['credit', 'debit'],
      required: true,
    },
    TransactionDate: {
      type: Date,
      default: Date.now,
    },
    description:{
      type:String
    }
  }],
  UpdatedAt: {
    type: Date,
    default: Date.now,
  },
  Date: {
    type: Date,
    default: Date.now,
  },
  Balance: {
    type: Number,
    default: 0,
  },
});

const Wallet = mongoose.model('Wallet', WalletSchema);

module.exports = Wallet;
