const Address = require('../../model/addressSchema');
const mongoose = require('mongoose');
const User = require('../../model/userSchema');
const HttpStatus = require('../../config/httpStatus');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');


const getAddAddress = catchAsync(async (req, res, next) => {
  const userId = req.session.user;
  const user = await User.findById(userId);

  res.render('addAddress', {
    user,
    activePage: 'address'
  });
});


const getAddAddressFromCheckout = catchAsync(async (req, res, next) => {
  const userId = req.session.user;

  const user = await User.findById(userId);

  res.render('addAddressCheckout', {
    user,
    activePage: 'address'
  });
});


const addAddress = catchAsync(async (req, res, next) => {
  const userId = req.session.user;
  const user = User.findById(userId);

  const {
    name,
    phone,
    alternativePhone,
    town,
    city,
    state,
    postCode
  } = req.body;

  if (!name || name.trim().length < 3) {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Name must be at least 3 characters long' });
  }

  const newAddress = new Address({
    userId,
    name: name.trim(),
    phone: phone.trim(),
    alternativePhone: alternativePhone ? alternativePhone.trim() : '',
    town: town ? town.trim() : '',
    city: city ? city.trim() : '',
    state: state ? state.trim() : '',
    postCode: postCode.trim()
  });

  await newAddress.save();
  res.status(HttpStatus.OK).json({ success: true, message: 'Address added successfully' });
});


const getEditAddress = catchAsync(async (req, res, next) => {
  const userId = req.session.user;
  const addressId = req.params.id;
  const user = User.findById(userId);
  const address = await Address.findOne({ _id: addressId, userId }).lean();

  if (!address) {
    return next(new AppError('Address not found', HttpStatus.NOT_FOUND));
  }

  res.render('edit-address', {
    address,
    user,
    activePage: 'address',
    addressId
  });
});


const getEditAddressCheckout = catchAsync(async (req, res, next) => {
  const userId = req.session.user;
  const addressId = req.params.id;
  const user = User.findById(userId);
  const address = await Address.findOne({ _id: addressId, userId }).lean();

  if (!address) {
    return next(new AppError('Address not found', HttpStatus.NOT_FOUND));
  }

  res.render('editaddressCheckout', {
    address,
    user,
    activePage: 'address',
    addressId
  });
});



const editAddress = catchAsync(async (req, res, next) => {
  const addressId = req.params.id;
  const userId = req.session.user;
  const { name, phone, alternativePhone, town, city, postCode } = req.body;


  if (!name || !phone || !postCode) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Please fill all required fields' });
  }

  if (name.trim().length < 3) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Name must be at least 3 characters long' });
  }


  const updatedAddress = await Address.findOneAndUpdate(
    { _id: addressId, userId },
    {
      name,
      phone,
      alternativePhone,
      town,
      city,
      postCode,
      line1: `${town}, ${city}, ${postCode}`
    },
    { new: true }
  );


  if (!updatedAddress) {
    return res.status(HttpStatus.NOT_FOUND).json({ error: 'Address not found or not authorized' });
  }


  return res.status(HttpStatus.OK).json({ message: 'Address updated successfully', redirect: '/edit-profile' });
});


const deleteAddress = catchAsync(async (req, res, next) => {
  const userId = req.session.user;
  const addressId = req.params.addressId;

  await Address.deleteOne({ _id: addressId, userId });
  res.redirect('/edit-profile');
});

const setDefaultAddress = catchAsync(async (req, res, next) => {
  const userId = req.session.user;

  const { addressId } = req.body;

  if (!userId || !addressId) {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: "Invalid request" });
  }

  const address = await Address.findOne({ _id: addressId, userId });
  if (!address) {
    return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: "Address not found" });
  }

  await Address.updateMany(
    { userId },
    { $set: { isDefault: false } }
  );

  address.isDefault = true;
  await address.save();

  return res.status(HttpStatus.OK).json({
    success: true,
    message: "Default address updated"
  });
});


module.exports = {
  getAddAddress,
  getAddAddressFromCheckout,
  addAddress,
  getEditAddress,
  getEditAddressCheckout,
  editAddress,
  deleteAddress,
  setDefaultAddress
};