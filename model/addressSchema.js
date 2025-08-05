const mongoose = require('mongoose');
const {Schema} = mongoose;

const addressSchema = new Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
    name:{
        type:String,
        required:true
    },
    town:{
        type:String,
        required:true
    },
    city:{
        type:String,
        required:true
    },
    street:{
        type:String,
        required:false
    },
    streetAddress:{
        type:String,
        required:false
    },
    phone:{
        type:String,
        required:true
    },
    alternativePhone:{
        type:String,
        required:true
    },
    postCode:{
        type:String,
        required:true
    },
    state:{
        type :String,

    }
});

const Address = mongoose.model('address',addressSchema);

module.exports = Address;