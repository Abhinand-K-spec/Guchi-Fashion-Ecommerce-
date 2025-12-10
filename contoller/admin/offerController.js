const Offers = require('../../model/offersSchema');
const Category = require('../../model/categorySchema');
const Product = require('../../model/productSchema');
const HttpStatus = require('../../config/httpStatus');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');

const addCategoryOffer = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { OfferName, StartDate, EndDate, Discount } = req.body;

  if (!OfferName || !StartDate || !EndDate || !Discount) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Offer name, start date, end date, and discount are required.' });
  }

  const start = new Date(StartDate);
  const end = new Date(EndDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (isNaN(start) || isNaN(end)) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Invalid date format.' });
  }
  if (start < today) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Start date cannot be in the past.' });
  }
  if (start > end) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Start date cannot be later than end date.' });
  }

  if (isNaN(Discount) || Discount < 0 || Discount >= 90) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Discount must be between 0 and 90.' });
  }

  const category = await Category.findById(id);
  if (!category) {
    return res.status(HttpStatus.NOT_FOUND).json({ error: 'Category not found.' });
  }

  const now = new Date();
  const existingOffer = await Offers.findOne({
    Category: id,
    Product: null,
    StartDate: { $lte: now },
    EndDate: { $gte: now }
  });
  if (existingOffer) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: 'An active offer already exists for this category.' });
  }

  const newOffer = new Offers({
    Category: id,
    Product: null,
    OfferName,
    StartDate: start,
    EndDate: end,
    Discount
  });

  await newOffer.save();
  res.redirect(`/admin/category?page=${req.query.page || 1}`);
});


const removeCategoryOffer = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { offerId } = req.body;

  const category = await Category.findById(id);
  if (!category) {
    return res.status(HttpStatus.NOT_FOUND).json({ error: 'Category not found.' });
  }

  const offer = await Offers.findOne({ _id: offerId, Category: id });
  if (!offer) {
    return res.status(HttpStatus.NOT_FOUND).json({ error: 'Offer not found.' });
  }

  await Offers.findByIdAndDelete(offerId);
  res.redirect(`/admin/category?page=${req.query.page || 1}`);
});


const addProductOffer = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { OfferName, StartDate, EndDate, Discount } = req.body;

  if (!OfferName || !StartDate || !EndDate || !Discount) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Offer name, start date, end date, and discount are required.' });
  }

  const start = new Date(StartDate);
  const end = new Date(EndDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (isNaN(start) || isNaN(end)) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Invalid date format.' });
  }
  if (start < today) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Start date cannot be in the past.' });
  }
  if (start > end) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Start date cannot be later than end date.' });
  }

  if (isNaN(Discount) || Discount < 0 || Discount >= 90) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Discount must be between 0 and 90.' });
  }

  const product = await Product.findById(id);
  if (!product) {
    return res.status(HttpStatus.NOT_FOUND).json({ error: 'Product not found.' });
  }

  const now = new Date();
  const existingOffer = await Offers.findOne({
    Product: id,
    Category: null,
    StartDate: { $lte: now },
    EndDate: { $gte: now }
  });
  if (existingOffer) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: 'An active offer already exists for this product.' });
  }

  const newOffer = new Offers({
    Category: null,
    Product: id,
    OfferName,
    StartDate: start,
    EndDate: end,
    Discount
  });

  await newOffer.save();

  const variant = product.Variants[0] || {};
  const regularPrice = variant.Price || 0;
  const newSalePrice = Math.round(variant.Price * (1 - Discount / 100));

  res.status(HttpStatus.OK).json({
    success: true,
    message: 'Offer added successfully',
    offer: newOffer,
    regularPrice,
    salePrice: newSalePrice
  });
});


const removeProductOffer = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { offerId } = req.body;

  const product = await Product.findById(id);
  if (!product) {
    return res.status(HttpStatus.NOT_FOUND).json({ error: 'Product not found.' });
  }

  const offer = await Offers.findOne({ _id: offerId, Product: id });
  if (!offer) {
    return res.status(HttpStatus.NOT_FOUND).json({ error: 'Offer not found.' });
  }

  await Offers.findByIdAndDelete(offerId);

  const variant = product.Variants[0] || {};
  const regularPrice = variant.Price || 0;
  const salePrice = variant.OfferPrice || variant.Price || 0;

  res.status(HttpStatus.OK).json({
    success: true,
    message: 'Offer removed successfully',
    regularPrice,
    salePrice
  });
});

module.exports = {
  addCategoryOffer,
  removeCategoryOffer,
  addProductOffer,
  removeProductOffer
};