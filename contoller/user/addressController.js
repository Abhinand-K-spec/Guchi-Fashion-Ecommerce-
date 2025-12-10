const Address = require('../../model/addressSchema');
const mongoose = require('mongoose');
const User = require('../../model/userSchema');
const HttpStatus = require('../../config/httpStatus');




const getAddAddress = async (req, res) => {
  try {

    const userId = req.session.user;
    const user = await User.findById(userId);

    res.render('addAddress', {
      user,
      activePage: 'address'
    });

  } catch (error) {

    console.log('Error loading add-address : ', error.message);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('page-404');

  }
};


const getAddAddressFromCheckout = async (req, res) => {
  try {

    const userId = req.session.user;

    const user = await User.findById(userId);

    res.render('addAddressCheckout', {
      user,
      activePage: 'address'
    });

  } catch (error) {

    console.log('Error loading add-address : ', error.message);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('page-404');

  }
};




const addAddress = async (req, res) => {
  try {

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

    newAddress.save();
    res.status(HttpStatus.OK).json({ success: true, message: 'Address added successfully' });

  } catch (error) {

    console.log('error adding address : ', error.message);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('page-404');

  }
};





const getEditAddress = async (req, res) => {
  try {

    const userId = req.session.user;
    const addressId = req.params.id;
    const user = User.findById(userId);
    const address = await Address.findOne({ _id: addressId, userId }).lean();


    res.render('edit-address', {
      address,
      user,
      activePage: 'address',
      addressId
    });


  } catch (error) {

    console.log('error loading edit address page :', error.message);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('page-404');

  }
};


const getEditAddressCheckout = async (req, res) => {
  try {

    const userId = req.session.user;
    const addressId = req.params.id;
    const user = User.findById(userId);
    const address = await Address.findOne({ _id: addressId, userId }).lean();


    res.render('editaddressCheckout', {
      address,
      user,
      activePage: 'address',
      addressId
    });


  } catch (error) {

    console.log('error loading edit address page :', error.message);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('page-404');

  }
};



const editAddress = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error updating address:', error);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Internal Server Error' });
  }
};




const deleteAddress = async (req, res) => {
  try {

    const userId = req.session.user;
    const addressId = req.params.addressId;

    await Address.deleteOne({ _id: addressId, userId });
    res.redirect('/edit-profile');

  } catch (error) {

    console.log('Error while deleting address: ', error.message);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('page-404');

  }
};

const setDefaultAddress = async (req, res) => {
  try {
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

  } catch (err) {
    console.error("Set default address error:", err);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Server error"
    });
  }
};


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