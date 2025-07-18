const User = require('../../model/userSchema');
const Address = require('../../model/addressSchema');
const nodemailer = require('nodemailer');




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




const profile = async(req,res)=>{

    try {

        const userId = req.session.user;

        if(!userId){
            return res.render('/login',{msg:'Please Login to get profile page'});
        }

        const userData = await User.findById(userId).lean();
        if(!userData) return res.status(400).render(page-404);
        
        const userAddresses = await Address.find({userId}).lean();

        res.render('profile',{
            user:{
                ...userData,
                addresses : userAddresses
            },
            activePage:'profile'
        })
    } catch (error) {

        console.log('error while loading profile',error.message);
        res.status(400).render('page-404');
        
    }
}




const getEditProfile = async(req,res)=>{

    try {

        const userId = req.session.user;
        const userData = await User.findById(userId).lean();
        const userAddresses = await Address.find({userId});

        res.render('editProfile',{
            user:{
                ...userData,
                addresses : userAddresses
            },
            activePage:'profile'
        })
        
    } catch (error) {
        
        console.log('error while loading editProfile page',error.message);
        res.status(400).render(page-404);
        
    }
}


  const updateEmailRequestOtp = async (req, res) => {
    try {
      const { email } = req.body;
      const userId = req.session.user;
  
      const otp = generateOtp();
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





  const getVerifyEmailOtpPage = async (req, res) => {
    try {
      const userId = req.session.user;
      if (req.session.newEmail) {
        return res.redirect('/profile');
      }
  
      res.render('verify-email-otp', {
        msg: req.flash('msg'),
        email: req.session.newEmail
      });
    } catch (err) {
      console.error('Error loading OTP verification page:', err);
      res.status(500).render('page-404');
    }
  };
  


  const verifyEmailOtp = async (req, res) => {
    const { otp } = req.body;
    const userId = req.session.user;
  
    if (otp === req.session.emailOTP) {
      await User.findByIdAndUpdate(userId, { email: req.session.newEmail },{name:req.session.newName});
  
      req.flash('msg', 'Email updated successfully');
      return res.redirect('/profile');
    } else {
      req.flash('msg', 'Invalid OTP');
      return res.redirect('/verify-email-otp');
    }
  };
  




  const uploadProfileImage = async (req, res) => {
    try {
      const userId = req.session.user;
     
  
      if (!userId || !req.file) return res.redirect('/profile');
  
      const profileImagePath = 'uploads/profile-images/' + req.file.filename;
    
  
      const updateResult = await User.findByIdAndUpdate(userId, {
        profileImage: profileImagePath
      });
  
      console.log("Update Result:", updateResult);
      res.redirect('/editProfile');
  
    } catch (err) {
      console.error(' Upload error:', err);
      res.status(500).render('page-404');
    }
  };
  


  const saveProfile = async(req,res)=>{
    try {
      return res.redirect('/profile')
    } catch (error) {
      res.render('page-404');
      console.log('Error :',error.message);
    }
  }



  


  const updateUsername = async (req, res) => {
    try {
      const userId = req.session.user;
      const { username } = req.body;
  
      if (!username || username.trim() === '') {
        return res.status(400).json({ error: 'Username cannot be empty' });
      }
      
  
      const updated = await User.updateOne(
        { _id: userId },
        { $set: { name: username.trim() } }
      );

      const updatedUser = await User.findById(userId);
      req.session.user = updatedUser;

  
      res.status(200).json({ message: 'Username updated successfully' });
    } catch (error) {
      console.error('Error updating username:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
  


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

}