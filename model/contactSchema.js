const mongoose = require('mongoose');

const { Schema, ObjectId } = mongoose;

const ContactSchema = new Schema({
  Subject: { type: String },
  Message: { type: String },
  CreatedAt: { type: Date },
  Name: { type: String },
  Email: { type: String },
});

const Contact = mongoose.model('Contact', ContactSchema);

module.exports = Contact;

