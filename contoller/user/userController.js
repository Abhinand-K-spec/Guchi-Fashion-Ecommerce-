const User = require('../../model/userSchema');
const category = require('../../model/categorySchema');
const Products = require('../../model/productSchema')
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const Cart = require('../../model/cartSchema');
const Orders = require('../../model/ordersSchema'); 
const Address = require('../../model/addressSchema');
const mongoose = require('mongoose'); 

const pageNotFound = async(req,res)=>{
    try {
        return res.render('page-404')
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}




const googleCallbackHandler = async (req, res) => {
  if (req.user.isBlocked) {
    req.logout(() => {
      req.flash('msg', 'User is blocked by admin')||null;
      res.redirect('/signup');
    });
  } else {
    req.session.user = req.user._id;
    res.redirect('/');
  }
};

const getForgotPasswordPage = (req, res) => {
    res.render('forgot-password', { msg: '' });
  };
  
 
  const handleForgotPassword = async (req, res) => {
    const { email } = req.body;
  
    try {
      
      console.log(`Password reset link should be sent to: ${email}`);
      res.render('forgot-password', { msg: 'If the email exists, a reset link has been sent.' });
    } catch (err) {
      console.error('Forgot password error:', err);
      res.render('forgot-password', { msg: 'An error occurred. Try again later.' });
    }
  };





const loadHomePage = async (req, res) => {
    try {
      const userId = req.session.user;
  
      const categories = await category.find({ isListed: true });
  
      const categoryIds = categories.map(cat => cat._id);
  
      const allProducts = await Products.find({
        IsListed: true,
        Category: { $in: categoryIds },
        
      }).sort({ CreatedDate: -1 });
  
      const featuredProducts = allProducts.slice(0, 4);
  
      const userData = userId ? await User.findById(userId) : null;
  
      res.render('home', {
        user: userData,
        products: allProducts,
        featuredProducts,
        activePage : 'home'
      });
  
    } catch (error) {
      console.log('Home page error:', error);
      res.json({'error':'Server error'});
    }
  };




  
const logout = async (req,res)=>{
    return req.session.destroy((err)=>{
        if(err){
            console.log('error occured',err);
            res.render('pageNotFound');
        }else{
            res.redirect('/login')
        }
    })
}



const loadSignup = async(req,res)=>{
    try{
        return res.render('signup')
    }catch(err){
        console.log('error occured');
        res.json({'error':'Server error'});
    }
}


const loadLogin = async(req,res)=>{
    try {
        if(!req.session.user){
            return res.render('login')
        }else{
            res.redirect('/');
        }
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}



const login = async(req,res)=>{
    try {
        const {email,password} = req.body;

        const findUser = await User.findOne({isAdmin:0,email:email});
        if(!findUser){
            return res.render('login',{msg:'User not found'});
        }if(findUser.isBlocked){
            return res.render('login',{msg:'User is blocked by admin'})
        }


        const passwordmatch = await bcrypt.compare(password,findUser.password);
        if(!passwordmatch){
            return res.render('login',{msg:`Password didn't match`});
        }

        req.session.user = findUser._id;
        res.redirect('/');

    } catch (error) {

        console.log('error occured while login',error);
        res.render('login',{msg:'Login failed please try again'});
        
    }
}


function generateOtp(){
    return Math.floor(100000+Math.random()*(900000)).toString()
}


async function sendVerification(email,otp){
    try {
        const transporter = nodemailer.createTransport({
            service:'gmail',
            port:587,
            secure:false,
            requireTLS:true,
            auth:{
                user:process.env.NODEMIALER_GMAIL,
                pass:process.env.NODEMAILER_PASSWORD
            }
        })

        const info = await transporter.sendMail({
            from:process.env.NODEMAILER_GMAIL,
            to:email,
            subject:'Verify your account',
            text:`Your OTP is ${otp}`,
            html:`<b>Your OTP: ${otp} </b>`
        })

        return info.accepted.length>0
    } catch (error) {
        console.error('error sending otp',error)
        return false;
    }
}


const signup = async (req, res) => {
  try {
      const { name, email, password } = req.body;
      const findUser = await User.findOne({ email });
      console.log('Email in signup',email);

      if (findUser) {
          return res.render('signup', { msg: 'User already exists' });
      }
     
      const otp = generateOtp();
      console.log('Generated OTP:', otp); 
      const emailSend = await sendVerification(email, otp);

       if (!emailSend) {
          return res.json('email-error');
      }

      req.session.otp = otp;
      req.session.userData = { name, email, password };
      res.render('verify-otp');
      console.log('OTP sent', otp); 

  } catch (error) {
      console.error('Error signing up', error);
      res.render('page-404');
  }
}


const securePassword = async (password) => {
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        return passwordHash;
    } catch (error) {
        console.error('Error hashing password:', error);
        throw new Error('Password hashing failed');
    }
};


const verifyOtp = async (req, res) => {
  try {
    console.log("BODY:", req.body);
    console.log("SESSION:", req.session);
    const userOtp = req.body.otp?.trim();

    // Validate OTP input
    if (!userOtp || !/^\d{6}$/.test(userOtp)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 6-digit OTP.' });
    }

    // Check if session data exists
    if (!req.session.userData || !req.session.otp) {
      return res.status(400).json({ success: false, message: 'Session expired. Please sign up again.' });
    }

    // Verify OTP
    if (userOtp === req.session.otp) {
      const user = req.session.userData;
      const passwordhash = await securePassword(user.password);

      const saveUserData = new User({
        name: user.name,
        email: user.email,
        password: passwordhash
      });

      await saveUserData.save();
      req.session.user = saveUserData._id;
      delete req.session.otp;
      delete req.session.userData;
      return res.status(200).json({ success: true, message: 'OTP verified successfully.', redirect: '/login' });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
    }
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return res.status(500).json({ success: false, message: 'An error occurred while verifying OTP. Please try again.' });
  }
};


const resendOtp = async (req, res) => {
    try {
      const email = req.session.userData?.email;
  
      if (!email) return res.redirect('/signup');
  
      const newOtp = generateOtp(); 
  
      req.session.otp = newOtp;
  
      const emailSend = await sendVerification(email, newOtp);
  
      if (!emailSend) {
        return res.render('verify-otp', { msg: 'Failed to resend OTP. Try again later.' });
      }
  
      console.log("New OTP:", newOtp);
      return res.render('verify-otp', { msg: 'New OTP has been sent to your email.' });
    } catch (err) {
      console.log('Resend OTP Error:', err);
      return res.redirect('/signup');
    }
  };
  

const getProductDetails = async (req, res) => {
    try {
      const productId = req.params.id;
      const product = await Products.findById(productId).populate('Category').lean();
  
      if (!product) return res.status(404).render('page-404');
  
      const recommendedProducts = await Products.find({
        _id: { $ne: productId },
        Category: product.Category._id,
        IsListed: true
      }).limit(4).lean();
  
      res.render('product-details', {
        product,
        recommendedProducts
      });
    } catch (error) {
      console.error('Error in getProductDetails:', error);
      res.status(500).render('page-404');
    }
  };


  const getShopPage = async (req, res) => {
    try {
      const limit = 6;
      const page = parseInt(req.query.page) || 1;
      const search = req.query.search || '';
      const sort = req.query.sort || '';
      const categoryId = req.query.category;
      const userId = req.session.user;
      const user = userId ? await User.findById(userId).lean() : null;
  
      const filter = { IsListed: true };
  
      if (search) {
        filter.productName = { $regex: search, $options: 'i' };
      }
  
      if (categoryId) {
        filter.Category = categoryId;
      }
  
      let sortOption = {};
      if (sort === 'name-asc') sortOption.productName = 1;
      else if (sort === 'name-desc') sortOption.productName = -1;
      else if (sort === 'price-asc') sortOption['Variants.0.Price'] = 1;
      else if (sort === 'price-desc') sortOption['Variants.0.Price'] = -1;
  
      const total = await Products.countDocuments(filter);
  
      const products = await Products.find(filter)
        .populate('Category')
        .sort(sortOption)
        .skip((page - 1) * limit)
        .limit(limit);
  
      const categories = await category.find();
  
      res.render('shop-page', {
        products,
        categories,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        categoryId,
        search,
        sort,
        user,
        activePage: 'shopnow'
      });
    } catch (err) {
      console.error('Shop page error:', err);
      res.status(500).send('Something went wrong');
    }
  };


  const checkout = async (req, res) => {
    try {
      const userId = req.session.user;
      const user = await User.findById(userId).lean();
      const addresses = await Address.find({ userId }).lean();
      const cartData = await Cart.findOne({ user: userId }).populate('items.product').lean();
  
      if (!cartData || !cartData.items.length) {
        return res.redirect('/cart');
      }
  
      let subtotal = 0;
      const cartItems = [];
  
      for (const item of cartData.items) {
        const product = item.product;
        const variant = product?.Variants?.[0];
  
        if (!product || !variant) {
          continue;
        }
  
        const price = variant.Price;
        const quantity = item.quantity;
        const itemTotal = price * quantity;
  
        
        cartItems.push({
          name: product.productName,
          image: product.Image[0] ? `uploads/product-images/${product.Image[0]}` : 'images/default.jpg',
          price,
          quantity,
          itemTotal,
          stock: variant.Stock || 0 
        });
        if (variant.Stock >= item.quantity) {
          subtotal += itemTotal;
        }
      }
  
      if (cartItems.length === 0) {
        return res.redirect('/cart');
      }
  
      const tax = Math.round(subtotal * 0.05);
      const discount = 0;
      const finalTotal = subtotal + tax - discount;
  
      res.render('checkout', {
        addresses,
        cartItems,
        subtotal,
        discount,
        tax,
        finalTotal,
        user,
        activePage: 'cart'
      });
  
    } catch (err) {
      console.error("Checkout error:", err);
      res.status(500).render('page-404');
    }
  };
  
  
  

  

  const getChangePassword = async (req, res) => {
    try {
      const userId = req.session.user;
      if (!userId) return res.redirect('/login');
  
      const user = await User.findById(userId).lean();
      if (!user) return res.redirect('/login');
  
      res.render('change-password', {
        user,
        activePage: 'change-password',
        msg: req.flash('msg')
      });
    } catch (error) {
      console.error('Error loading change password page:', error);
      res.status(500).render('page-404');
    }
  };



  const changePassword = async (req, res) => {
    try {
      const userId = req.session.user;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
  
      const { currentPassword, newPassword, confirmPassword } = req.body;
  
      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.json({ success: false, message: 'All fields are required' });
      }
  
      if (newPassword !== confirmPassword) {
        return res.json({ success: false, message: 'New password and confirm password do not match' });
      }
  
      const user = await User.findById(userId);
      if (!user) {
        return res.json({ success: false, message: 'User not found' });
      }
  
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.json({ success: false, message: 'Current password is incorrect' });
      }
  
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedPassword;
      await user.save();
  
      return res.json({ success: true });
  
    } catch (error) {
      console.error('Password change error:', error);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  };



  const updateEmailRequestOtp = async (req, res) => {
    try {
      const { email } = req.body;
      const userId = req.session.user;
  
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      req.session.emailOTP = otp;
      req.session.newEmail = email;

  
      const emailSent = await sendVerification(email, otp);
      console.log(otp)
  
      if (!emailSent) {
        req.flash('msg', 'Failed to send OTP');
        return res.redirect('/profile');
      }
  
      res.redirect('/verify-email-otp');
    } catch (err) {
      console.error('OTP send error:', err);
      res.redirect('/profile');
    }
  };


module.exports = {
    loadHomePage,
    pageNotFound,
    loadSignup,
    loadLogin,
    signup,
    verifyOtp,
    login,
    logout,
    getProductDetails,
    getShopPage,
    resendOtp,
    getForgotPasswordPage,
    handleForgotPassword,
    googleCallbackHandler,
    checkout,
    getChangePassword,
    changePassword,
    updateEmailRequestOtp,
} 