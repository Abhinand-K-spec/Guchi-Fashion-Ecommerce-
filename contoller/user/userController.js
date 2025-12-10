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
const HttpStatus = require('../../config/httpStatus');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');


const securePassword = async (password) => {
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    return passwordHash;
  } catch (error) {
    console.error('Error hashing password:', error);
    throw new Error('Password hashing failed');
  }
};


function generateOtp() {
  return Math.floor(100000 + Math.random() * (900000)).toString();
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
      from: process.env.NODEMAILER_GMAIL,
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

function generateReferralCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
}


const pageNotFound = catchAsync(async (req, res, next) => {
  return res.status(HttpStatus.NOT_FOUND).render('page-404');
});

const googleCallbackHandler = catchAsync(async (req, res, next) => {
  if (req.user.isBlocked) {
    req.logout((err) => {
      if (err) return next(err);
      req.flash('msg', 'User is blocked by admin');
      res.redirect('/signup');
    });
  } else {
    req.session.user = req.user._id;

    const isNewUser = (Date.now() - new Date(req.user.createdAt).getTime()) < 60 * 1000;

    if (!req.user.referalCode) {
      let referralCode = generateReferralCode();
      let existingUser = await User.findOne({ referalCode: referralCode });
      while (existingUser) {
        referralCode = generateReferralCode();
        existingUser = await User.findOne({ referalCode: referralCode });
      }
      await User.findByIdAndUpdate(req.user._id, { referalCode: referralCode });
    }

    req.session.save((err) => {
      if (err) return next(err);
      if (isNewUser) {
        return res.redirect('/auth/google-referral');
      }
      res.redirect('/');
    });
  }
});


const handleForgotPassword = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  const otp = generateOtp();
  const emailSend = await sendVerification(email, otp); // await added for consistency
  if (!emailSend) {
    return res.render('forgot-password', { msg: `Can't send verification to mail`, error: 'Failed to send OTP' }); // added error prop for template safety
  }

  req.session.tempPass = password;
  req.session.email = email;
  req.session.otp = otp;

  console.log('OTP sent:', otp);
  res.render('forgot-verify-otp');
});

const verifyForgotOtp = catchAsync(async (req, res, next) => {
  const otp = req.body.otp;


  if (req.session.otp !== otp) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Please enter a valid OTP' });
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
});


const getProductOffer = async (product, variantIndex = 0) => {
  try {
    if (!product || !product.Variants || !Array.isArray(product.Variants) || product.Variants.length === 0) {
      return { offer: null, salePrice: 0 };
    }
    const now = new Date();
    const validVariantIndex = Math.max(0, Math.min(variantIndex, product.Variants.length - 1));
    const variantPrice = product.Variants[validVariantIndex].Price || 0;
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

const loadHomePage = catchAsync(async (req, res, next) => {
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

    const { offer, salePrice } = await getProductOffer(product, 0);
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
});

const logout = catchAsync(async (req, res, next) => {
  delete req.session.user;
  res.redirect('/login');
});

const loadSignup = catchAsync(async (req, res, next) => {
  return res.render('signup');
});

const loadLogin = catchAsync(async (req, res, next) => {
  if (!req.session.user) {
    return res.render('login');
  } else {
    res.redirect('/');
  }
});

const login = catchAsync(async (req, res, next) => {
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
  req.session.save((err) => {
    if (err) console.error('Session save error:', err);
    res.redirect('/');
  });
});




const signup = catchAsync(async (req, res, next) => {

  const { name, email, password, referralCode } = req.body;

  if (!name || name.trim().length < 3) {
    return res.render('signup', { msg: 'Name must be at least 3 characters long' });
  }

  const emailPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/;
  if (!emailPattern.test(email)) {
    return res.render('signup', { msg: 'Invalid email format' });
  }

  const findUser = await User.findOne({ email });

  if (findUser) {
    return res.render('signup', { msg: 'User already exists' });
  }
  const otp = generateOtp();
  console.log('Generated OTP:', otp);
  const emailSend = await sendVerification(email, otp);
  if (!emailSend) {
    return res.render('signup', { msg: 'Failed to send verification email. Please check your email address.' });
  }
  req.session.otp = otp;
  req.session.userData = { name, email, password, referralCode };
  res.render('verify-otp');
  console.log('OTP sent:', otp);
});


const verifyOtp = catchAsync(async (req, res, next) => {
  const userOtp = req.body.otp?.trim();
  if (!userOtp || !/^\d{6}$/.test(userOtp)) {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Please enter a valid 6-digit OTP.' });
  }
  if (!req.session.userData || !req.session.otp) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Session expired. Please sign up again.' });
  }

  if (req.session.otp !== req.body.otp) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Invalid OTP. Please try again.' });
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

      }
    }

    await saveUserData.save();
    req.session.user = saveUserData._id;
    delete req.session.otp;
    delete req.session.userData;
    req.session.save((err) => {
      if (err) console.error('Session save error:', err);
      return res.status(HttpStatus.OK).json({ success: true, message: 'OTP verified successfully.', redirect: '/login' });
    });
  } else {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Invalid OTP. Please try again.' });
  }
});


const resendOtp = catchAsync(async (req, res, next) => {
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
});


const getOrderSuccess = catchAsync(async (req, res, next) => {
  const orderId = req.params.orderId;
  const order = await Orders.findById(orderId).populate('Items.product').lean();
  if (!order) {
    return next(new AppError('Order not found', HttpStatus.NOT_FOUND));
  }
  const userId = req.session.user;
  const user = await User.findById(userId).lean();
  res.render('order-success', {
    order,
    user,
    activePage: 'orders'
  });
});

const getOrderFailure = catchAsync(async (req, res, next) => {
  const userId = req.session.user;
  const user = await User.findById(userId).lean();
  res.render('order-failure', {
    user,
    activePage: 'orders'
  });
});

const getChangePassword = catchAsync(async (req, res, next) => {
  const userId = req.session.user;
  if (!userId) return res.redirect('/login');
  const user = await User.findById(userId).lean();
  if (!user) return res.redirect('/login');
  res.render('change-password', {
    user,
    activePage: 'change-password',
    msg: req.flash('msg')
  });
});

const changePassword = catchAsync(async (req, res, next) => {
  const userId = req.session.user;
  if (!userId) return res.status(HttpStatus.UNAUTHORIZED).json({ success: false, message: 'Unauthorized' });
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'All fields are required' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'New password and confirm password do not match' });
  }
  const user = await User.findById(userId);
  if (!user) {
    return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: 'User not found' });
  }

  const isMatch = await bcrypt.compare(currentPassword, user.password);

  if (!isMatch) {
    return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: 'Current password is incorrect' });
  }
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  user.password = hashedPassword;
  await user.save();


  const updatedUser = await User.findById(userId);

  return res.status(HttpStatus.OK).json({ success: true });
});




const getOrders = catchAsync(async (req, res, next) => {
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
});



const getForgotPasswordPage = catchAsync(async (req, res, next) => {
  if (req.session.user) {
    const user = await User.findById(req.session.user);
    if (user) {
      const otp = generateOtp();
      console.log('OTP:', otp);
      const sent = await sendVerification(user.email, otp);

      if (sent) {
        req.session.forgotEmail = user.email;
        req.session.forgotOtp = otp;
        req.session.otpExpiry = Date.now() + 5 * 60 * 1000;
        req.session.isProfileReset = true;
        return res.redirect('/forgot-verify-otp');
      }
    }
  }
  res.render('forgot-password', { msg: '', error: '' });
});

const sendForgotOtp = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    return res.render('forgot-password', { error: "No account found with this email", msg: '' });
  }

  const otp = generateOtp();
  const sent = await sendVerification(email, otp);
  console.log('otp sent:', otp);


  if (!sent) {
    return res.render('forgot-password', { error: "Failed to send OTP. Try again.", msg: '' });
  }
  req.session.forgotEmail = email;
  req.session.forgotOtp = otp;
  req.session.otpExpiry = Date.now() + 5 * 60 * 1000;

  res.redirect('/forgot-verify-otp');
});

const getForgotOtpPage = (req, res) => {
  if (!req.session.forgotEmail) {
    return res.redirect('/forgot-password');
  }
  res.render('forgot-verify-otp', { msg: 'OTP sent to your email' });
};

const verifyForgotOtpAndReset = catchAsync(async (req, res, next) => {
  const { otp, password } = req.body;

  if (!req.session.forgotOtp || !req.session.forgotEmail) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: "Session expired. Please try again." });
  }

  if (Date.now() > req.session.otpExpiry) {
    clearForgotSession(req);
    return res.status(HttpStatus.BAD_REQUEST).json({ error: "OTP expired. Please request a new one." });
  }

  if (otp !== req.session.forgotOtp) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: "Invalid OTP" });
  }

  const hashedPassword = await securePassword(password);
  await User.findOneAndUpdate(
    { email: req.session.forgotEmail },
    { password: hashedPassword }
  );

  const isProfileReset = req.session.isProfileReset;
  clearForgotSession(req);
  if (isProfileReset) {
    delete req.session.isProfileReset;
    return res.status(HttpStatus.OK).json({ success: true, message: "Password reset successfully!", redirect: '/profile' });
  }
  return res.status(HttpStatus.OK).json({ success: true, message: "Password reset successfully!", redirect: '/login' });
});

const resendForgotOtp = catchAsync(async (req, res, next) => {
  if (!req.session.forgotEmail) {
    return res.redirect('/forgot-password');
  }

  const otp = generateOtp();
  const sent = await sendVerification(req.session.forgotEmail, otp);
  console.log('new otp:', otp);


  if (sent) {
    req.session.forgotOtp = otp;
    req.session.otpExpiry = Date.now() + 5 * 60 * 1000;
    res.render('forgot-verify-otp', { msg: "New OTP sent successfully!" });
  } else {
    res.render('forgot-verify-otp', { msg: "Failed to resend OTP" });
  }
});

function clearForgotSession(req) {
  delete req.session.forgotEmail;
  delete req.session.forgotOtp;
  delete req.session.otpExpiry;
}

const loadGoogleReferral = (req, res) => {
  res.render('google-referral');
};

const applyGoogleReferral = catchAsync(async (req, res, next) => {
  const { referralCode, skip } = req.body;
  const userId = req.session.user;

  if (skip) {
    return res.redirect('/');
  }

  if (!referralCode || referralCode.trim() === "") {
    return res.render('google-referral', { msg: "Please enter a valid code" });
  }

  const referrer = await User.findOne({ referalCode: referralCode.toUpperCase(), isBlocked: false });

  if (!referrer) {
    return res.render('google-referral', { msg: "Invalid referral code" });
  }

  if (referrer._id.toString() === userId.toString()) {
    return res.render('google-referral', { msg: "You cannot refer yourself" });
  }

  const currentUser = await User.findById(userId);
  if (currentUser.referedBy) {
    return res.redirect('/');
  }

  currentUser.referedBy = referrer._id;

  await User.findByIdAndUpdate(referrer._id, { $set: { referals: currentUser._id } });

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
    CouponCode: `REF-${currentUser._id}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    CouponName: `${currentUser.name}'s 20% Referral Welcome`,
    Discount: 20,
    MinCartValue: 500,
    StartDate: new Date(),
    ExpiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
    IsListed: true,
    UserId: currentUser._id,
    UsageLimit: 1,
    UsedBy: [],
    CreatedAt: new Date()
  });
  await newUserCoupon.save();

  await currentUser.save();

  res.redirect('/');
});

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
  loadGoogleReferral,
  applyGoogleReferral,
  sendForgotOtp
};