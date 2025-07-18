const User = require('../../model/userSchema');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
 
const pageNotFound = async(req,res)=>{
  try {
      return res.render('page-404')
  } catch (error) {
      res.redirect('/pageNotFound');
  }
}

const loadLogin = (req,res)=>{
    if(req.session.admin){
        return res.redirect('/admin');
    }
    res.render('admin-login');
}

const loadDashboard = async(req,res)=>{
   try {
    
    if(req.session.admin){
        return res.render('admin');
    }
    res.render('admin-login')

   } catch (error) {
    res.render('pageNotFound');
   }
}


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
      res.status(500).render('pageNotFound');
    }
  };
  
const logout = async (req,res)=>{
  return req.session.destroy((err)=>{
      if(err){
          console.log('error occured',err);
          res.render('pageNotFound');
      }else{
          res.render('admin-login',{msg:'Logged out'})
      }
  })
}
  

const loadUsers = async(req,res)=>{
  res.render('users')
}






module.exports = {
    loadLogin,
    loadDashboard,
    login,
    logout,
    loadUsers,
    pageNotFound
}