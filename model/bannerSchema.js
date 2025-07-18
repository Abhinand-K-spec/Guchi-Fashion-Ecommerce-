const mongoose = require('mongoose');

const { Schema, ObjectId } = mongoose;

const BannerSchema = new Schema({
  UpdatedAt: { type: Date },
  Image: { type: Schema.Types.ObjectId },
  CreatedAt: { type: Date },
});

const Banner = mongoose.model('Banner', BannerSchema);

module.exports = Banner;

