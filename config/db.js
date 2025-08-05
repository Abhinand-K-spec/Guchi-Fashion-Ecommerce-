const { log } = require('console');
const mongoose = require('mongoose');
const env = require('dotenv').config();

const connectdb = async()=>{
    try{
        await mongoose.connect(process.env.Mongodb_uri);
        console.log(`DB is connected`);
    }catch(err){
        console.log(`db connection error${err.message}`);
        process.exit(1);
    }
};

module.exports = connectdb;