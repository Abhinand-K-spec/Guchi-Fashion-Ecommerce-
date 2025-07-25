const Offers = require('../../model/offersSchema');
const Category = require('../../model/categorySchema');
const Product = require('../../model/productSchema');

// Add category offer
const addCategoryOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { OfferName, StartDate, EndDate, Discount, MinPrice, MaxPrice } = req.body;

    if (!OfferName || !StartDate || !EndDate || !Discount) {
      return res.status(400).json({ error: 'Offer name, start date, end date, and discount are required.' });
    }

    const start = new Date(StartDate);
    const end = new Date(EndDate);
    if (isNaN(start) || isNaN(end)) {
      return res.status(400).json({ error: 'Invalid date format.' });
    }
    if (start > end) {
      return res.status(400).json({ error: 'Start date cannot be later than end date.' });
    }

    if (isNaN(Discount) || Discount < 0 || Discount > 100) {
      return res.status(400).json({ error: 'Discount must be between 0 and 100.' });
    }

    if (MinPrice && (isNaN(MinPrice) || MinPrice < 0)) {
      return res.status(400).json({ error: 'Minimum price must be a non-negative number.' });
    }
    if (MaxPrice && (isNaN(MaxPrice) || MaxPrice < 0)) {
      return res.status(400).json({ error: 'Maximum price must be a non-negative number.' });
    }
    if (MinPrice && MaxPrice && parseFloat(MinPrice) > parseFloat(MaxPrice)) {
      return res.status(400).json({ error: 'Minimum price cannot be greater than maximum price.' });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found.' });
    }

    const now = new Date();
    const existingOffer = await Offers.findOne({
      Category: id,
      Product: null,
      StartDate: { $lte: now },
      EndDate: { $gte: now }
    });
    if (existingOffer) {
      return res.status(400).json({ error: 'An active offer already exists for this category.' });
    }

    const newOffer = new Offers({
      Category: id,
      Product: null,
      OfferName,
      StartDate: start,
      EndDate: end,
      Discount,
      MinPrice: MinPrice || null,
      MaxPrice: MaxPrice || null
    });

    await newOffer.save();
    res.redirect(`/admin/category?page=${req.query.page || 1}`);
  } catch (error) {
    console.error('Error in addCategoryOffer:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Remove category offer
const removeCategoryOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { offerId } = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found.' });
    }

    const offer = await Offers.findOne({ _id: offerId, Category: id });
    if (!offer) {
      return res.status(404).json({ error: 'Offer not found.' });
    }

    await Offers.findByIdAndDelete(offerId);
    res.redirect(`/admin/category?page=${req.query.page || 1}`);
  } catch (error) {
    console.error('Error in removeCategoryOffer:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Add product offer
const addProductOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { OfferName, StartDate, EndDate, Discount, MinPrice, MaxPrice } = req.body;

    if (!OfferName || !StartDate || !EndDate || !Discount) {
      return res.status(400).json({ error: 'Offer name, start date, end date, and discount are required.' });
    }

    const start = new Date(StartDate);
    const end = new Date(EndDate);
    if (isNaN(start) || isNaN(end)) {
      return res.status(400).json({ error: 'Invalid date format.' });
    }
    if (start > end) {
      return res.status(400).json({ error: 'Start date cannot be later than end date.' });
    }

    if (isNaN(Discount) || Discount < 0 || Discount > 100) {
      return res.status(400).json({ error: 'Discount must be between 0 and 100.' });
    }

    if (MinPrice && (isNaN(MinPrice) || MinPrice < 0)) {
      return res.status(400).json({ error: 'Minimum price must be a non-negative number.' });
    }
    if (MaxPrice && (isNaN(MaxPrice) || MaxPrice < 0)) {
      return res.status(400).json({ error: 'Maximum price must be a non-negative number.' });
    }
    if (MinPrice && MaxPrice && parseFloat(MinPrice) > parseFloat(MaxPrice)) {
      return res.status(400).json({ error: 'Minimum price cannot be greater than maximum price.' });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const now = new Date();
    const existingOffer = await Offers.findOne({
      Product: id,
      Category: null,
      StartDate: { $lte: now },
      EndDate: { $gte: now }
    });
    if (existingOffer) {
      return res.status(400).json({ error: 'An active offer already exists for this product.' });
    }

    const newOffer = new Offers({
      Category: null,
      Product: id,
      OfferName,
      StartDate: start,
      EndDate: end,
      Discount,
      MinPrice: MinPrice || null,
      MaxPrice: MaxPrice || null
    });

    await newOffer.save();
    res.redirect(`/admin/products?page=${req.query.page || 1}`);
  } catch (error) {
    console.error('Error in addProductOffer:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Remove product offer
const removeProductOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { offerId } = req.body;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const offer = await Offers.findOne({ _id: offerId, Product: id });
    if (!offer) {
      return res.status(404).json({ error: 'Offer not found.' });
    }

    await Offers.findByIdAndDelete(offerId);
    res.redirect(`/admin/products?page=${req.query.page || 1}`);
  } catch (error) {
    console.error('Error in removeProductOffer:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  addCategoryOffer,
  removeCategoryOffer,
  addProductOffer,
  removeProductOffer
};