const User = require('../../model/userSchema');
const category = require('../../model/categorySchema');
const Products = require('../../model/productSchema');
const Offers = require('../../model/offersSchema');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const Orders = require('../../model/ordersSchema');
const Address = require('../../model/addressSchema');
const Coupon = require('../../model/couponsSchema');
const mongoose = require('mongoose');


const securePassword = async (password) => {
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    return passwordHash;
  } catch (error) {
    console.error('Error hashing password:', error);
    throw new Error('Password hashing failed');
  }
};


function generateOtp(){
    return Math.floor(100000+Math.random()*(900000)).toString();
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
        });

        const info = await transporter.sendMail({
            from:process.env.NODEMAILER_GMAIL,
            to:email,
            subject:'Verify your account',
            text:`Your OTP is ${otp}`,
            html:`<b>Your OTP: ${otp} </b>`
        });

        return info.accepted.length>0;
    } catch (error) {
        console.error('error sending otp',error);
        return false;
    }
}

function generateReferralCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
}


const pageNotFound = async (req, res) => {
  try {
    return res.render('page-404');
  } catch (error) {
    res.redirect('/pageNotFound');
  }
};

const googleCallbackHandler = async (req, res) => {
  if (req.user.isBlocked) {
    req.logout(() => {
      req.flash('msg', 'User is blocked by admin') || null;
      res.redirect('/signup');
    });
  } else {
    req.session.user = req.user._id;
    res.redirect('/');
  }
};


const handleForgotPassword = async (req, res) => {
  const { email,password } = req.body;
  try {

    const otp = generateOtp();
    const emailSend = sendVerification(email,otp);
    if(!emailSend){
      return res.render('forgot-password',{msg:`Can't send verification to mail`})
    }

    req.session.tempPass = password;
    req.session.email = email;
    req.session.otp = otp;

    console.log('OTP sent:',otp);
    res.render('forgot-verify-otp',);
  } catch (err) {
    console.error('Forgot password error:', err);
    res.render('forgot-password', { msg: 'An error occurred. Try again later.' });
  }
};

const verifyForgotOtp = async (req, res) => {
  try {
    const otp = req.body.otp;


    if (req.session.otp !== otp) {
      return res.json({ error: 'Please enter a valid OTP' });
    }

    const email = req.session.email;
    const plainPassword = req.session.tempPass;


    const password = await securePassword(plainPassword);


    await User.findOneAndUpdate(
      { email: email },
      { $set: { password: password } }
    );

    req.session.otp = null;
    req.session.tempPass = null;
    req.session.email = null;

    return res.json({ success: true, message: 'Password updated successfully' });

  } catch (error) {
    console.log(error);
    return res.json({ error: 'Something went wrong' });
  }
};


const getProductOffer = async (product) => {
    try {
      if (!product || !product.Variants || !Array.isArray(product.Variants) || product.Variants.length === 0) {
        return { offer: null, salePrice: 0 };
      }
      const now = new Date();
      const variantPrice = product.Variants[0].Price || 0;
      const [productOffer, categoryOffer] = await Promise.all([
        Offers.findOne({
          Product: product._id,
          Category: null,
          StartDate: { $lte: now },
          EndDate: { $gte: now },
        }).lean(),
        Offers.findOne({
          Category: product.Category,
          Product: null,
          StartDate: { $lte: now },
          EndDate: { $gte: now },
          
        }).lean()
      ]);
      let offer = null;
      if (productOffer && categoryOffer) {
        offer = productOffer.Discount >= categoryOffer.Discount ? productOffer : categoryOffer;
      } else {
        offer = productOffer || categoryOffer;
      }
      if (!offer) {
        return { offer: null, salePrice: variantPrice };
      }
      const salePrice = variantPrice * (1 - offer.Discount / 100);
      return { offer, salePrice };
    } catch (err) {
      console.error(`Error fetching offer for productId: ${product?._id || 'unknown'}`, err);
      return { offer: null, salePrice: 0 };
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
    }).populate('Category').sort({ CreatedDate: -1 }).lean();

    const productsWithOffers = await Promise.all(allProducts.map(async (product) => {
      if (!product.Variants || !Array.isArray(product.Variants) || product.Variants.length === 0) {
        console.error(`Invalid Variants for product: ${product._id}`);
        return {
          ...product,
          Variants: [{ Price: 0, salePrice: 0, Stock: 0 }],
          offer: null
        };
      }
      
      const { offer, salePrice } = await getProductOffer(product);
      const variant = product.Variants[0];
      return {
        ...product,
        Variants: [{
          Price: variant.Price || 0,
          salePrice: salePrice || variant.Price || 0,
          Stock: variant.Stock || 0
        }],
        offer
      };
    }));
    const featuredProducts = productsWithOffers.slice(0, 4);
    const userData = userId ? await User.findById(userId).lean() : null;
    res.render('home', {
      user: userData,
      products: productsWithOffers,
      featuredProducts,
      activePage: 'home'
    });
  } catch (error) {
    console.log('Home page error:', error);
    res.json({ 'error': 'Server error' });
  }
};

const logout = async (req, res) => {
  try {
    delete req.session.user;
    res.redirect('/login')
  } catch (error) {
    console.log('error session destroy user');
    res.render('page-404');
  }
};

const loadSignup = async (req, res) => {
  try {
    return res.render('signup');
  } catch (err) {
    console.log('error occurred');
    res.json({ 'error': 'Server error' });
  }
};

const loadLogin = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.render('login');
    } else {
      res.redirect('/');
    }
  } catch (error) {
    res.redirect('/pageNotFound');
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const findUser = await User.findOne({ isAdmin: 0, email: email });
    if (!findUser) {
      return res.render('login', { msg: 'User not found' });
    }
    if (findUser.isBlocked) {
      return res.render('login', { msg: 'User is blocked by admin' });
    }
    const passwordmatch = await bcrypt.compare(password, findUser.password);
    if (!passwordmatch) {
      return res.render('login', { msg: `Password didn't match` });
    }
    req.session.user = findUser._id;
    res.redirect('/');
  } catch (error) {
    console.log('error occurred while login', error);
    res.render('login', { msg: 'Login failed please try again' });
  }
};

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerification(email, otp) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMIALER_GMAIL,
        pass: process.env.NODEMAILER_PASSWORD
      }
    });
    const info = await transporter.sendMail({
      from: process.env.NODEMIALER_GMAIL,
      to: email,
      subject: 'Verify your account',
      text: `Your OTP is ${otp}`,
      html: `<b>Your OTP: ${otp} </b>`
    });
    return info.accepted.length > 0;
  } catch (error) {
    console.error('error sending otp', error);
    return false;
  }
}

const signup = async (req, res) => {
  try {

    const { name, email, password, referralCode } = req.body; 
    const findUser = await User.findOne({ email });

    if (findUser) {
      return res.render('signup', { msg: 'User already exists' });
    }
    const otp = generateOtp();
    console.log('Generated OTP:', otp);
    const emailSend = await sendVerification(email, otp);
    if (!emailSend) {
      return res.json({ 'error': 'email-error' });
    }
    req.session.otp = otp;
    req.session.userData = { name, email, password, referralCode }; 
    res.render('verify-otp');
    console.log('OTP sent:', otp);
  } catch (error) {
    console.error('Error signing up:', error);
    res.render('page-404');
  }
};


const verifyOtp = async (req, res) => {
  try {
    const userOtp = req.body.otp?.trim();
    if (!userOtp || !/^\d{6}$/.test(userOtp)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 6-digit OTP.' });
    }
    if (!req.session.userData || !req.session.otp) {
      return res.json({ error: 'Session expired. Please sign up again.' });
    }
    
    if (req.session.otp !== req.body.otp) {
      return res.json({ error: 'Invalid OTP. Please try again.' });
    }
    
    if (userOtp === req.session.otp) {
      const user = req.session.userData;
      const passwordhash = await securePassword(user.password);
      
      let referralCode = generateReferralCode();
      let existingUser = await User.findOne({ referalCode: referralCode });
      while (existingUser) {
        referralCode = generateReferralCode();
        existingUser = await User.findOne({ referalCode: referralCode });
      }

      const saveUserData = new User({
        name: user.name,
        email: user.email,
        password: passwordhash,
        referalCode: referralCode 
      });


      if (user.referralCode) {
        const referrer = await User.findOne({ 
          referalCode: user.referralCode.toUpperCase(),
          isBlocked: false 
        });
        if (referrer) {
          saveUserData.referedBy = referrer._id;
          await User.findByIdAndUpdate(referrer._id, {
            $set: { referals: saveUserData._id }
          });

          // Create 50% discount for referring new user
          const referrerCoupon = new Coupon({
            CouponCode: `REF-${referrer._id}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
            CouponName: `${referrer.name}'s 50% Referral Reward`,
            Discount: 50,
            MinCartValue: 500,
            StartDate: new Date(),
            ExpiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
            IsListed: true,
            UserId: referrer._id,
            UsageLimit: 1,
            UsedBy: [],
            CreatedAt: new Date()
          });
          await referrerCoupon.save();


          const newUserCoupon = new Coupon({
            CouponCode: `REF-${saveUserData._id}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
            CouponName: `${saveUserData.name}'s 20% Referral Welcome`,
            Discount: 20,
            MinCartValue: 500,
            StartDate: new Date(),
            ExpiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
            IsListed: true,
            UserId: saveUserData._id,
            UsageLimit: 1,
            UsedBy: [],
            CreatedAt: new Date()
          });
          await newUserCoupon.save();

          console.log(`Referral coupons created: 50% for ${referrer._id}, 20% for ${saveUserData._id}`);
        }
      }

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


const getOrderSuccess = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await Orders.findById(orderId).populate('Items.product').lean();
    if (!order) {
      return res.status(404).render('page-404');
    }
    const userId = req.session.user;
    const user = await User.findById(userId).lean();
    res.render('order-success', {
      order,
      user,
      activePage: 'orders'
    });
  } catch (err) {
    console.error('Order success page error:', err);
    res.status(500).render('page-404');
  }
};

const getOrderFailure = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId).lean();
    res.render('order-failure', {
      user,
      activePage: 'orders'
    });
  } catch (err) {
    console.error('Order failure page error:', err);
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

    
    console.log('Raw req.body:', { currentPassword, newPassword, confirmPassword });

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
     console.log('bcrypt.compare result:', isMatch);

    if (!isMatch) {
      return res.json({ success: false, message: 'Current password is incorrect' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    console.log('New hashed password:', hashedPassword);

    user.password = hashedPassword;
    await user.save();

    
    const updatedUser = await User.findById(userId);
    console.log('After save, stored password:', updatedUser.password);

    return res.json({ success: true });
  } catch (error) {
    console.error('Password change error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};




const getOrders = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect('/login');
    }
    const user = await User.findById(userId).lean();
    const orders = await Orders.find({ UserId: userId })
      .populate('Items.product')
      .sort({ OrderDate: -1 })
      .lean();
    res.render('orders', {
      user,
      orders,
      activePage: 'orders'
    });
  } catch (err) {
    console.error('Get orders error:', err);
    res.status(500).render('page-404');
  }
};



const getForgotPasswordPage = (req, res) => {
  res.render('forgot-password', { msg: '', error: '' });
};

const sendForgotOtp = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.render('forgot-password', { error: "No account found with this email" });
    }

    const otp = generateOtp();
    const sent = await sendVerification(email, otp);
    console.log('otp sent:',otp);
    

    if (!sent) {
      return res.render('forgot-password', { error: "Failed to send OTP. Try again." });
    }

    req.session.forgotEmail = email;
    req.session.forgotOtp = otp;
    req.session.otpExpiry = Date.now() + 5 * 60 * 1000; // 5 min expiry

    res.redirect('/forgot-verify-otp');
  } catch (err) {
    console.error(err);
    res.render('forgot-password', { error: "Server error. Try again later." });
  }
};

const getForgotOtpPage = (req, res) => {
  if (!req.session.forgotEmail) {
    return res.redirect('/forgot-password');
  }
  res.render('forgot-verify-otp', { msg: 'OTP sent to your email' });
};

const verifyForgotOtpAndReset = async (req, res) => {
  try {
    const { otp, password } = req.body;

    if (!req.session.forgotOtp || !req.session.forgotEmail) {
      return res.json({ error: "Session expired. Please try again." });
    }

    if (Date.now() > req.session.otpExpiry) {
      clearForgotSession(req);
      return res.json({ error: "OTP expired. Please request a new one." });
    }

    if (otp !== req.session.forgotOtp) {
      return res.json({ error: "Invalid OTP" });
    }

    const hashedPassword = await securePassword(password);
    await User.findOneAndUpdate(
      { email: req.session.forgotEmail },
      { password: hashedPassword }
    );

    clearForgotSession(req);
    return res.json({ success: true, message: "Password reset successfully!" });

  } catch (error) {
    console.error(error);
    return res.json({ error: "Something went wrong" });
  }
};

const resendForgotOtp = async (req, res) => {
  if (!req.session.forgotEmail) {
    return res.redirect('/forgot-password');
  }

  const otp = generateOtp();
  const sent = await sendVerification(req.session.forgotEmail, otp);
  console.log('new otp:',otp);
  

  if (sent) {
    req.session.forgotOtp = otp;
    req.session.otpExpiry = Date.now() + 5 * 60 * 1000;
    res.render('forgot-verify-otp', { msg: "New OTP sent successfully!" });
  } else {
    res.render('forgot-verify-otp', { msg: "Failed to resend OTP" });
  }
};

function clearForgotSession(req) {
  delete req.session.forgotEmail;
  delete req.session.forgotOtp;
  delete req.session.otpExpiry;
}

module.exports = {
  loadHomePage,
  pageNotFound,
  loadSignup,
  loadLogin,
  signup,
  verifyOtp,
  login,
  logout,
  resendOtp,
  getForgotPasswordPage,
  handleForgotPassword,
  googleCallbackHandler,
  getOrderSuccess,
  getOrderFailure,
  getChangePassword,
  changePassword,
  getOrders,
  getProductOffer,
  verifyForgotOtp,
  resendForgotOtp,
  verifyForgotOtpAndReset,
  getForgotOtpPage,
  sendForgotOtp
};