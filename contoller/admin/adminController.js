const User = require('../../model/userSchema');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Orders = require('../../model/ordersSchema');
 
const pageNotFound = async(req,res)=>{
  try {
      return res.render('page-404');
  } catch (error) {
      res.redirect('/pageNotFound');
  }
};

const loadLogin = (req,res)=>{
    if(req.session.admin){
        return res.redirect('/admin');
    }
    res.render('admin-login');
};

const loadDashboard = async(req,res)=>{
   try {
     if(!req.session.admin){
      return res.render('admin-login');
    }

    const orders = Orders.find({});
    const  totalCount = Orders.countDocuments();
    res.render('admin')

   } catch (error) {
    res.render('page-404');
   }
};


const login = async (req, res) => {
    try {
      const { email, password } = req.body;
  
      const admin = await User.findOne({ email: email, isAdmin: true });
  
      if (!admin) {
        return res.render('admin-login', { msg: 'Admin not found' });
      }
  
      if (!admin.password) {
        return res.render('admin-login', { msg: 'Password is missing for this admin' });
      }
  
      const passwordMatch = await bcrypt.compare(password, admin.password);
  
      if (passwordMatch) {
        req.session.admin = true;
        return res.redirect('/admin');
      } else {
        return res.render('admin-login', { msg: 'Password not matching' });
      }
  
    } catch (error) {
      console.error('Error during admin login:', error);
      res.status(500).render('page-404');
    }
  };
  
const logout = async (req,res)=>{
 try {

  delete req.session.admin;
  res.redirect('/admin/login');
  
 } catch (error) {
  console.log('error destroying admin session');
  res.render('page-404');
 }
};
  

const loadUsers = async(req,res)=>{
  res.render('users');
};


module.exports = {
    loadLogin,
    loadDashboard,
    login,
    logout,
    loadUsers,
    pageNotFound
};