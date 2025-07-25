const Offers = require('../../model/offersSchema');
const Category = require('../../model/categorySchema');

const addCategoryOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { OfferName, StartDate, EndDate, Discount, MinPrice, MaxPrice } = req.body;

    // Validate required fields
    if (!OfferName || !StartDate || !EndDate || !Discount) {
      return res.status(400).json({ error: 'Offer name, start date, end date, and discount are required.' });
    }

    // Validate dates
    const start = new Date(StartDate);
    const end = new Date(EndDate);
    if (isNaN(start) || isNaN(end)) {
      return res.status(400).json({ error: 'Invalid date format.' });
    }
    if (start > end) {
      return res.status(400).json({ error: 'Start date cannot be later than end date.' });
    }

    // Validate discount
    if (isNaN(Discount) || Discount < 0 || Discount > 100) {
      return res.status(400).json({ error: 'Discount must be between 0 and 100.' });
    }

    // Validate optional price fields
    if (MinPrice && (isNaN(MinPrice) || MinPrice < 0)) {
      return res.status(400).json({ error: 'Minimum price must be a non-negative number.' });
    }
    if (MaxPrice && (isNaN(MaxPrice) || MaxPrice < 0)) {
      return res.status(400).json({ error: 'Maximum price must be a non-negative number.' });
    }
    if (MinPrice && MaxPrice && parseFloat(MinPrice) > parseFloat(MaxPrice)) {
      return res.status(400).json({ error: 'Minimum price cannot be greater than maximum price.' });
    }

    // Check if category exists
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found.' });
    }

    // Check if an active offer already exists
    const now = new Date(); // July 24, 2025, 9:57 PM IST
    const existingOffer = await Offers.findOne({
      Category: id,
      StartDate: { $lte: now },
      EndDate: { $gte: now }
    });
    if (existingOffer) {
      return res.status(400).json({ error: 'An active offer already exists for this category.' });
    }

    // Create new offer
    const newOffer = new Offers({
      Category: id,
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

const removeCategoryOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { offerId } = req.body;

    // Validate category and offer
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

module.exports = {
  addCategoryOffer,
  removeCategoryOffer
}; 