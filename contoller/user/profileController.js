const User = require('../../model/userSchema');
const Address = require('../../model/addressSchema');
const nodemailer = require('nodemailer');
const HttpStatus = require('../../config/httpStatus');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');


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




const profile = catchAsync(async (req, res, next) => {
  const userId = req.session.user;

  if (!userId) {
    return res.render('/login', { msg: 'Please Login to get profile page' });
  }

  const userData = await User.findById(userId).lean();
  if (!userData) {
    return next(new AppError('User not found', HttpStatus.NOT_FOUND));
  }

  const userAddresses = await Address.find({ userId }).lean();

  res.render('profile', {
    user: {
      ...userData,
      addresses: userAddresses
    },
    activePage: 'profile'
  });
});




const getEditProfile = catchAsync(async (req, res, next) => {
  const userId = req.session.user;
  const userData = await User.findById(userId).lean();
  const userAddresses = await Address.find({ userId });

  res.render('editProfile', {
    user: {
      ...userData,
      addresses: userAddresses
    },
    activePage: 'profile'
  });
});


const updateEmailRequestOtp = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  const userId = req.session.user;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  req.session.emailOTP = otp;
  req.session.newEmail = email;
  const emailSent = await sendVerification(email, otp);
  if (!emailSent) {
    req.flash('msg', 'Failed to send OTP');
    return res.redirect('/profile');
  }
  console.log('OTP sent successfully:', otp);
  res.redirect('/verify-email-otp');
});





const getVerifyEmailOtpPage = catchAsync(async (req, res, next) => {
  const userId = req.session.user;
  if (!req.session.newEmail) {
    return res.redirect('/profile');
  }

  res.render('verify-email-otp', {
    msg: req.flash('msg'),
    email: req.session.newEmail
  });
});



const verifyEmailOtp = catchAsync(async (req, res, next) => {
  const { otp } = req.body;
  const userId = req.session.user;

  if (otp === req.session.emailOTP) {
    await User.findByIdAndUpdate(userId, { email: req.session.newEmail }, { name: req.session.newName });

    req.flash('msg', 'Email updated successfully');

    return res.redirect('/editProfile');
  } else {
    req.flash('msg', 'Invalid OTP');
    return res.redirect('/verify-email-otp');
  }
});




const uploadProfileImage = catchAsync(async (req, res, next) => {
  const userId = req.session.user;

  if (!userId || !req.file) { return res.redirect('/profile'); }

  const cloudinaryUrl = req.file.path;
  const publicId = req.file.filename;

  const updateResult = await User.findByIdAndUpdate(userId, {
    profileImage: cloudinaryUrl,
    profileImagePublicId: publicId
  });

  res.redirect('/editProfile');
});





const saveProfile = catchAsync(async (req, res, next) => {
  return res.redirect('/profile');
});






const updateUsername = catchAsync(async (req, res, next) => {
  const userId = req.session.user;
  const { username } = req.body;

  if (!username || username.trim().length < 3) {
    return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Username must be at least 3 characters long' });
  }


  const updated = await User.updateOne(
    { _id: userId },
    { $set: { name: username.trim() } }
  );

  const updatedUser = await User.findById(userId);
  req.session.user = updatedUser._id;


  res.status(HttpStatus.OK).json({ message: 'Username updated successfully' });
});



module.exports = {
  profile,
  getEditProfile,
  updateEmailRequestOtp,
  generateOtp,
  sendVerification,
  getVerifyEmailOtpPage,
  verifyEmailOtp,
  uploadProfileImage,
  saveProfile,
  updateUsername
};