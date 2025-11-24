const Address = require('../../model/addressSchema');
const mongoose = require('mongoose');
const User = require('../../model/userSchema');




const getAddAddress = async (req,res)=>{
    try {

        const userId = req.session.user;
        const user = await User.findById(userId);

        res.render('addAddress',{
            user,
            activePage : 'address'
        });
        
    } catch (error) {

        console.log('Error loading add-address : ',error.message);
        res.render('page-404');
        
    }
};


const getAddAddressFromCheckout = async (req,res)=>{
  try {

      const userId = req.session.user;

      const user = await User.findById(userId);

      res.render('addAddressCheckout',{
          user,
          activePage : 'address'
      });
      
  } catch (error) {

      console.log('Error loading add-address : ',error.message);
      res.render('page-404');
      
  }
};




const addAddress = async(req,res)=>{
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
          res.status(200).json({ success: true, message: 'Address added successfully' });
        
    } catch (error) {

        console.log('error adding address : ',error.message);
        res.render('page-404');
        
    }
};





const getEditAddress = async(req,res)=>{
    try {

        const userId = req.session.user;
        const addressId = req.params.id;
        const user = User.findById(userId);
        const address = await Address.findOne({ _id: addressId, userId }).lean();
       

        res.render('edit-address',{
            address,
            user,
            activePage:'address',
            addressId
        });

        
    } catch (error) {

        console.log('error loading edit address page :', error.message);
        res.render('page-404');
        
    }
};


const getEditAddressCheckout = async(req,res)=>{
  try {

      const userId = req.session.user;
      const addressId = req.params.id;
      const user = User.findById(userId);
      const address = await Address.findOne({ _id: addressId, userId }).lean();
     

      res.render('editaddressCheckout',{
          address,
          user,
          activePage:'address',
          addressId
      });

      
  } catch (error) {

      console.log('error loading edit address page :', error.message);
      res.render('page-404');
      
  }
};



const editAddress = async (req, res) => {
    try {
      const addressId = req.params.id;
      const userId = req.session.user;
      const { name, phone, alternativePhone, town, city, postCode } = req.body;
  
      
      if (!name || !phone || !postCode) {
        return res.status(400).json({ error: 'Please fill all required fields' });
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
        return res.status(404).json({ error: 'Address not found or not authorized' });
      }

  
      return res.status(200).json({ message: 'Address updated successfully', redirect: '/edit-profile' });
    } catch (error) {
      console.error('Error updating address:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  };
  



  const deleteAddress = async(req,res)=>{
    try {

        const userId = req.session.user;
        const addressId = req.params.addressId;

        await Address.deleteOne({_id:addressId,userId});
        res.redirect('/edit-profile');
        
    } catch (error) {

        console.log('Error while deleting address: ',error.message);
        res.render('page-404');
        
    }
  };

  const setDefaultAddress = async (req, res) => {
    try {
      const userId = req.session.user;
      console.log(userId);
      
      const { addressId } = req.body;
  
      if (!userId || !addressId) {
        return res.json({ success: false, message: "Invalid request" });
      }
  
      // Verify the address belongs to this user
      const address = await Address.findOne({ _id: addressId, userId });
      if (!address) {
        return res.json({ success: false, message: "Address not found" });
      }
  
      // Remove default from all user's addresses
      await Address.updateMany(
        { userId },
        { $set: { isDefault: false } }
      );
  
      // Set the selected one as default
      address.isDefault = true;
      await address.save();
  
      return res.json({
        success: true,
        message: "Default address updated"
      });
  
    } catch (err) {
      console.error("Set default address error:", err);
      return res.json({
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