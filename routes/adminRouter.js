const express = require('express');
const router = express.Router();
const adminController = require('../contoller/admin/adminController');
const costumerController = require('../contoller/admin/costumerController');
const categoryController = require('../contoller/admin/categoryController');
const productsController = require('../contoller/admin/productsController');
const orderController = require('../contoller/admin/orderController');
const couponController = require('../contoller/admin/couponController');
const offerController = require('../contoller/admin/offerController');
const salesController = require('../contoller/admin/salesController');
const { userAuth, adminAuth } = require('../middlewares/auth');
const upload = require('../middlewares/multer');

router.get('/pageNotFound', adminController.pageNotFound);
router.get('/login', adminController.loadLogin);
router.post('/login', adminController.login);
router.get('/', adminAuth, adminController.loadDashboard);
router.get('/logout', adminController.logout);

router.get('/users', adminAuth, costumerController.customerinfo);
router.get('/blockCostumer', adminAuth, costumerController.costumerBlocked);
router.get('/unblockCostumer', adminAuth, costumerController.costumerUnBlocked);
router.get('/costumer/clear', adminAuth, costumerController.clearSearch);

router.get('/category', adminAuth, categoryController.categoryinfo);
router.post('/addCategory', adminAuth, categoryController.addCategory);
router.post('/unlistCategory', adminAuth, categoryController.unlist);
router.post('/listCategory', adminAuth, categoryController.list);
router.get('/editCategory/:id', adminAuth, categoryController.getEditCategory);
router.post('/editCategory/:id', adminAuth, categoryController.editCategory);
router.get('/category/search', adminAuth, categoryController.searchCategory);
router.get('/category/clear', adminAuth, categoryController.clearSearch);

router.get('/addProducts', adminAuth, productsController.getAddProductPage);
router.post('/addproduct', adminAuth, upload.none(), productsController.addProducts);
router.get('/products', adminAuth, productsController.getAllProducts);
router.get('/unlistProduct/:productId', adminAuth, productsController.unlist);
router.get('/listProduct/:productId', adminAuth, productsController.list);
router.get('/editProduct/:productId', adminAuth, productsController.getEditProductPage);
router.post('/updateProduct/:productId', upload.any(), productsController.postEditProduct);

router.get('/orders', adminAuth, orderController.getAdminOrders);
// router.post('/order-status/:orderId', adminAuth, orderController.updateOrderStatus);
router.post('/order-details/:orderId/update-item-status/:itemId', orderController.updateItemStatus);
router.get('/order-details/:orderId', adminAuth, orderController.getOrderDetails);
router.post('/approve-return/:orderId', adminAuth, orderController.approveReturn);
router.post('/reject-return/:orderId', adminAuth, orderController.rejectReturn);
router.post('/order-details/:orderId/cancel-item/:itemId', adminAuth, orderController.cancelSingleItem);
router.post('/order-details/:orderId/return-item/:itemId', adminAuth, orderController.returnSingleItem);

//Coupon management -------------------------------------------------------------->
router.get('/coupon',adminAuth,couponController.coupon);
router.post('/addCoupon',userAuth,couponController.addCoupon);
router.get('/coupons', couponController.coupon);
router.post('/addCoupon', couponController.addCoupon);
router.get('/unlistCoupon/:couponId', adminAuth, couponController.unlist);
router.get('/listCoupon/:couponId', adminAuth, couponController.list);
// router.get('/editCoupon/:id', couponController.editCoupon);
// router.post('/updateCoupon/:id', couponController.updateCoupon);


router.post('/addCategoryOffer/:id', offerController.addCategoryOffer);
router.post('/removeCategoryOffer/:id', offerController.removeCategoryOffer);
router.post('/addProductOffer/:id', offerController.addProductOffer);
router.post('/removeProductOffer/:id', offerController.removeProductOffer);


router.get('/sales', salesController.getSalesReport);
router.get('/sales/download', salesController.downloadSalesReport);



module.exports = router;