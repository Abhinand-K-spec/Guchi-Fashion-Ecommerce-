const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    phone: {
        type: String,
        required: false,
        unique: true,
        sparse: true,
       
    },
    googleId: {
        type: String,
        unique: true,
        // sparse: true // if not all users have this
    },
    password: {
        type: String,
        required: false
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    updatedAt: {
        type: Date
    },
    referalCode: {
        type: String
    },
    gender: {
        type: String
    },
    firstName: {
        type: String
    },
    lastName: {
        type: String
    },
    referals: {
        type: Schema.Types.ObjectId, 
        ref: 'User' 
    },
    referedBy:{
        type:Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    profileImage: { type: String, default: '' },
    cart: {
        type: Schema.Types.ObjectId,
        ref: 'Cart'
    },
    wallet: {
        type: Schema.Types.ObjectId,
        ref: 'Wallet'
    },
    redeemed: {
        type: Boolean,
        default: false
    },
    category: {
        type: Schema.Types.ObjectId,
        ref: 'Category'
    }
});


const User = mongoose.model("User", userSchema);
module.exports = User;
