const express = require('express');
const router = express.Router();
const passport = require('passport');
const userController = require('../contoller/user/userController');
const orderController = require('../contoller/user/orderController');
const profileController = require('../contoller/user/profileController');
const cartController = require('../contoller/user/cartController');
const addressController = require('../contoller/user/addressController');
const wishlistController = require('../contoller/user/wishlistController');
const walletController = require('../contoller/user/walletController');
const couponController = require('../contoller/user/couponController');
const productController = require('../contoller/user/productController');
const paymentController = require('../contoller/user/paymentController');
const { userAuth, adminAuth } = require('../middlewares/auth');

const upload = require('../middlewares/cloudinaryUpload');

// Route using Cloudinary upload--------------------------------------------------------------------------->
router.post('/upload-profile-image', upload.single('profileImage'), profileController.uploadProfileImage);

router.get('/pageNotFound', userController.pageNotFound);
router.get('/', userController.loadHomePage);

router.get('/signup', userController.loadSignup);
router.post('/signup', userController.signup);

router.get('/login', userController.loadLogin);
router.post('/login', userController.login);

router.get('/forgot-password', userController.getForgotPasswordPage);
router.post('/forgot-password', userController.handleForgotPassword);
router.get('/change-password', userAuth, userController.getChangePassword);
router.post('/change-password', userAuth, userController.changePassword);

router.get('/logout', userController.logout);

// profile management------------------------------------------------------------------------------------->
router.get('/profile', userAuth, profileController.profile);
router.post('/update-email-request-otp', userAuth, profileController.updateEmailRequestOtp);
router.get('/verify-email-otp', userAuth, profileController.getVerifyEmailOtpPage);
router.post('/verify-email-otp', userAuth, profileController.verifyEmailOtp);
router.get('/edit-profile', userAuth, profileController.getEditProfile);
router.get('/editProfile', userAuth, profileController.uploadProfileImage);
router.get('/saveProfile', userAuth, profileController.saveProfile);
router.post('/profile/update-username', userAuth, profileController.updateUsername);
//--------------------------------------------------------------------------------------------------------->

// address management------------------------------------------------------------------------------------->
router.get('/add-address', userAuth, addressController.getAddAddress);
router.post('/add-address', userAuth, addressController.addAddress);
router.get('/edit-address/:id', userAuth, addressController.getEditAddress);
router.post('/edit-address/:id', userAuth, addressController.editAddress);
router.get('/delete-address/:addressId', userAuth, addressController.deleteAddress);
//-------------------------------------------------------------------------------------------------------->

router.post('/verify-otp', userController.verifyOtp);
router.get('/resend-otp', userController.resendOtp);

router.get('/auth/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  prompt: 'select_account'  
}));

router.get(
  '/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/signup', failureFlash: true }),
  userController.googleCallbackHandler
);

router.get('/product-details/:id', productController.getProductDetails);

router.post('/addToCart/:productId', userAuth, cartController.addToCart);
router.patch('/cart/update-quantity/:id', userAuth, cartController.updateCartQuantity);
router.delete('/cart/remove/:id', userAuth, cartController.removeFromCart);
router.get('/cart/data', cartController.getCartData);
router.get('/cart', userAuth, cartController.cart);
router.patch('/cart/update-quantity/:id', userAuth, cartController.updateCartQuantity);
router.delete('/cart/remove/:id', userAuth, cartController.removeFromCart);

router.get('/shopnow', productController.getShopPage);
router.get('/shop', productController.getShopPage);

router.get('/checkout', userAuth, cartController.checkout);
router.post('/place-order', userAuth, orderController.placeOrder); 
router.post('/validate-coupon', couponController.validateCoupon);

router.post('/verify-payment', userAuth, paymentController.verifyPayment);
router.get('/order-confirmation/:orderId', userAuth, userController.getOrderSuccess);
router.get('/payment-success/:orderId', userAuth, paymentController.getPaymentSuccess); 
router.get('/payment-failure/:orderId', userAuth, paymentController.getPaymentFailure);

// order management------------------------------------------------------------------------------------->
router.get('/orders', userAuth, orderController.listOrders);
router.get('/order/:id', userAuth, orderController.orderDetails);
router.post('/order/:id/cancel', userAuth, orderController.cancelOrder);
router.get('/order/:id/invoice', userAuth, orderController.downloadInvoice);
router.post('/order/:orderId/cancel-item/:itemId', userAuth, orderController.cancelItem);
router.post('/order/:orderId/return-item/:itemId', userAuth, orderController.requestReturnItem);
//----------------------------------------------------------------------------------------------------->




// Wallet routes------------------------------------------------------------------------------------>
router.get('/wallet', userAuth, walletController.getWallet);
router.post('/add-funds', userAuth, walletController.addFunds);
router.post('/verify-wallet-payment', userAuth, walletController.verifyWalletPayment);



router.get('/wishlist',userAuth,wishlistController.getWishlist);
router.post('/wishlist/add-to-cart', wishlistController.addToCartFromWishlist);
router.post('/wishlist/remove', wishlistController.removeFromWishlist);
router.post('/add', wishlistController.addToWishlist);
router.get('/add-to-wishlist/:productId',userAuth,wishlistController.addToWishlist)


module.exports = router;