const Offers = require('../../model/offersSchema');
const Category = require('../../model/categorySchema');
const Product = require('../../model/productSchema');

// Add category offer
const addCategoryOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { OfferName, StartDate, EndDate, Discount } = req.body;

    if (!OfferName || !StartDate || !EndDate || !Discount) {
      return res.status(400).json({ error: 'Offer name, start date, end date, and discount are required.' });
    }

    const start = new Date(StartDate);
    const end = new Date(EndDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (isNaN(start) || isNaN(end)) {
      return res.status(400).json({ error: 'Invalid date format.' });
    }
    if (start < today) {
      return res.status(400).json({ error: 'Start date cannot be in the past.' });
    }
    if (start > end) {
      return res.status(400).json({ error: 'Start date cannot be later than end date.' });
    }

    if (isNaN(Discount) || Discount < 0 || Discount >= 90) {
      return res.status(400).json({ error: 'Discount must be between 0 and 90.' });
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
      Discount
    });

    await newOffer.save();
    res.redirect(`/admin/category?page=${req.query.page || 1}`);
  } catch (error) {
    console.error('Error in addCategoryOffer:', error);
    res.status(500).json({ error: 'Server error' });
  }
};


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


const addProductOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { OfferName, StartDate, EndDate, Discount } = req.body;

    if (!OfferName || !StartDate || !EndDate || !Discount) {
      return res.status(400).json({ error: 'Offer name, start date, end date, and discount are required.' });
    }

    const start = new Date(StartDate);
    const end = new Date(EndDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (isNaN(start) || isNaN(end)) {
      return res.status(400).json({ error: 'Invalid date format.' });
    }
    if (start < today) {
      return res.status(400).json({ error: 'Start date cannot be in the past.' });
    }
    if (start > end) {
      return res.status(400).json({ error: 'Start date cannot be later than end date.' });
    }

    if (isNaN(Discount) || Discount < 0 || Discount >= 90) {
      return res.status(400).json({ error: 'Discount must be between 0 and 90.' });
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
      Discount
    });

    await newOffer.save();
    await newOffer.save();

    // Calculate new price/details for UI update
    const variant = product.Variants[0] || {};
    const regularPrice = variant.Price || 0;
    // Calculate sale price with new discount
    const newSalePrice = Math.round(variant.Price * (1 - Discount / 100));

    res.json({
      success: true,
      message: 'Offer added successfully',
      offer: newOffer,
      regularPrice,
      salePrice: newSalePrice
    });
  } catch (error) {
    console.error('Error in addProductOffer:', error);
    res.status(500).json({ error: 'Server error' });
  }
};


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

    // Calculate new prices to return
    const variant = product.Variants[0] || {};
    const regularPrice = variant.Price || 0;
    const salePrice = variant.OfferPrice || variant.Price || 0;

    res.json({
      success: true,
      message: 'Offer removed successfully',
      regularPrice,
      salePrice
    });
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