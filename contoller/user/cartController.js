const Cart = require('../../model/cartSchema');
const User = require('../../model/userSchema');
const Products = require('../../model/productSchema');
const Address = require('../../model/addressSchema');
const Orders = require('../../model/ordersSchema');
const Coupon = require('../../model/couponsSchema');
const Offers = require('../../model/offersSchema')

const cart = async (req, res) => {
  try {
    // console.log('here cart function')
    const userId = req.session.user;
    const user = await User.findById(userId).lean();

    const cartData = await Cart.findOne({ user: userId })
    
      .populate('Items.product')
      .lean();
      // console.log('from cart function',cartData)

    if (!cartData || !cartData.items.length) {
      return res.render('cart', {
        cartItems: [],
        totalPrice: 0,
        user,
        activePage: 'cart'
      });
    }

    let totalPrice = 0;
    const cartItems = [];
    const validItems = [];
    for (const item of cartData.Items) {
      const product = item.product;
      if (!product || !product.productName) {
        cartItems.push({
          _id: '',
          name: 'Unnamed Product',
          image: 'images/default.jpg',
          price: 0,
          quantity: item.quantity,
          stock: 0,
          itemTotal: 0
        });
        continue;
      }

      const variant = product.Variants?.[0];
      const price = variant?.Price || 0;
      const quantity = item.quantity;
      const itemTotal = price * quantity;

      let imagePath = 'images/default.jpg';
      if (product.Image?.length) {
        const raw = product.Image[0];
        imagePath = raw.startsWith('http') ? raw : `${raw}`;
      }

      cartItems.push({
        _id: product._id,
        name: product.productName,
        image: imagePath,
        price,
        quantity,
        stock: variant?.Stock || 0,
        itemTotal
      });

      if (variant?.Stock >= item.quantity) {
        totalPrice += itemTotal;
        validItems.push(item);
      }
    }

    await Cart.updateOne(
      { user: userId },
      { $set: { Items: validItems } }
    );

    res.render('cart', {
      cartItems,
      totalPrice,
      user,
      activePage: 'cart'
    });
  } catch (error) {
    console.error('Error rendering cart page:', error);
    res.status(500).render('page-404');
  }
};

const getCartData = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.json({ success: false, message: 'User not logged in' });

    const cartData = await Cart.findOne({ user: userId }).populate('Items.product').lean();

    if (!cartData || !cartData.Items.length) {
      return res.json({ success: true, cartItems: [], totalPrice: 0 });
    }

    let totalPrice = 0;
    const cartItems = cartData.Items.map(item => {
      const product = item.product;
      const variant = product?.Variants?.[0];
      const price = variant?.Price || 0;
      const quantity = item.quantity;
      const itemTotal = price * quantity;
      if (variant?.Stock >= item.quantity) {
        totalPrice += itemTotal;
      }
      let imagePath = 'images/default.jpg';
      if (product.Image?.length) {
        const raw = product.Image[0];
        imagePath = raw.startsWith('http') ? raw : `${raw}`;
      }
      return {
        _id: product._id,
        name: product.productName,
        image: imagePath,
        price,
        quantity,
        stock: variant?.Stock || 0,
        itemTotal
      };
    });

    res.json({ success: true, cartItems, totalPrice });
  } catch (err) {
    console.error('Get cart data error:', err);
    res.json({ success: false, message: 'Error fetching cart data' });
  }
};

const addToCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.productId;

    if (!userId) return res.redirect('/login');

    const product = await Products.findById(productId);
    if (!product) return res.redirect('/shop');
    if (product.Variants[0]?.Stock <= 0) {
      return res.status(400).json({ error: 'This product is currently out of stock' });
    }

    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      cart = new Cart({ user: userId, Items: [] });
    }

    const index = cart.Items.findIndex(item => item.product.toString() === productId);

    if (index >= 0) {
      if (cart.Items[index].quantity < product.Variants[0].Stock) {
        cart.Items[index].quantity += 1;
      } else {
        return res.status(400).json({ error: 'Not enough stock available' });
      }
    } else {
      cart.Items.push({ product: productId, quantity: 1 });
    }

    await cart.save();
    res.redirect('/shop');
  } catch (err) {
    console.error('Add to cart error:', err);
    res.redirect('/shop');
  }
};

const updateCartQuantity = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.id;
    const { action } = req.body;

    if (!userId || !productId || !action) {
      return res.json({ success: false, message: 'Invalid request data.' });
    }

    const cart = await Cart.findOne({ user: userId }).populate('Items.product');
    
    if (!cart) {
      return res.json({ success: false, message: 'Cart not found.' });
    }

    const item = cart.Items.find(i => String(i.product._id) === String(productId));
    if (!item) {
      console.log(`Item not found: productId=${productId}, cart.Items=${JSON.stringify(cart.Items.map(i => String(i.product._id)))}`);
      return res.json({ success: false, message: 'Item not found in cart.' });
    }

    if (action === 'increment') {
      item.quantity += 1;
      const stock = item.product?.Variants?.[0]?.Stock || 0;
      if (item.quantity > 5) {
        item.quantity -= 1; // Revert increment
        return res.json({ success: false, message: 'You cannot add more than 5 items.' });
      }
      if (item.quantity > stock) {
        item.quantity -= 1;
        return res.json({ success: false, message: `Only ${stock} items are available.` });
      }
    } else if (action === 'decrement') {
      if (item.quantity <= 1) {
        return res.json({ success: false, message: 'Quantity cannot be less than 1.' });
      }
      item.quantity -= 1;
    } else {
      return res.json({ success: false, message: 'Invalid action.' });
    }

    await cart.save();
    console.log(`Cart saved: userId=${userId}, productId=${productId}, newQuantity=${item.quantity}`);

    let totalPrice = 0;
    const cartItems = cart.Items.map(item => {
      const product = item.product;
      const variant = product?.Variants?.[0];
      const price = variant?.Price || 0;
      const quantity = item.quantity;
      const itemTotal = price * quantity;
      if (variant?.Stock >= item.quantity) {
        totalPrice += itemTotal;
      }
      let imagePath = 'images/default.jpg';
      if (product.Image?.length) {
        const raw = product.Image[0];
        imagePath = raw.startsWith('http') ? raw : `${raw}`;
      }
      return {
        _id: product._id,
        name: product.productName,
        image: imagePath,
        price,
        quantity,
        stock: variant?.Stock || 0,
        itemTotal
      };
    });

    res.json({ success: true, cartItems, totalPrice });
  } catch (err) {
    console.error('Update quantity error:', err);
    res.json({ success: false, message: 'Error updating quantity' });
  }
};

const removeFromCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.id;

    if (!userId) return res.json({ success: false, message: 'User not logged in' });

    const cart = await Cart.findOne({ user: userId });
    if (!cart) return res.json({ success: false, message: 'Cart not found' });

    const itemIndex = cart.Items.findIndex(item => item.product.toString() === productId);
    if (itemIndex === -1) {
      cart.Items.splice(itemIndex, 1);
      await cart.save();
      return res.json({ success: true });
    }

    cart.Items.splice(itemIndex, 1);
    await cart.save();

    res.json({ success: true });
  } catch (err) {
    console.error('Remove cart error:', err);
    res.json({ success: false, message: 'Error removing item from cart' });
  }
};

const getProductOffer = async (product) => {
  try {
    if (!product || !product.Variants || !Array.isArray(product.Variants) || product.Variants.length === 0) {
      console.error(`Invalid product data: ${JSON.stringify(product)}`);
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
        $or: [
          { MinPrice: { $exists: false } },
          { MinPrice: { $lte: variantPrice } }
        ],
        $or: [
          { MaxPrice: { $exists: false } },
          { MaxPrice: { $gte: variantPrice } }
        ]
      }).lean(),
      Offers.findOne({
        Category: product.Category,
        Product: null,
        StartDate: { $lte: now },
        EndDate: { $gte: now },
        $or: [
          { MinPrice: { $exists: false } },
          { MinPrice: { $lte: variantPrice } }
        ],
        $or: [
          { MaxPrice: { $exists: false } },
          { MaxPrice: { $gte: variantPrice } }
        ]
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

const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { selectedAddressId, coupon, paymentMethod, razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body;

    if (!userId) {
      console.log('No user logged in');
      return res.status(401).json({ success: false, message: 'Please log in to place an order.' });
    }

    if (!selectedAddressId) {
      console.log('No address selected');
      return res.redirect('/checkout');
    }

    const cart = await Cart.findOne({ user: userId }).populate('Items.product').lean();
    if (!cart || !cart.Items.length) {
      console.log('Cart empty or not found for user:', userId);
      return res.redirect('/checkout');
    }

    const selectedAddress = await Address.findById(selectedAddressId).lean();
    if (!selectedAddress) {
      console.log('Invalid address ID:', selectedAddressId);
      return res.status(400).send("Invalid address selected");
    }

    let subtotal = 0;
    let totalItemDiscount = 0;
    const orderItems = [];
    const stockUpdates = [];
    const wishlistItemsToRemove = [];

    for (const item of cart.Items) {
      const product = item.product;
      const variant = product?.Variants?.[0];

      if (!product || !variant || !product._id || !product.Category || variant.Stock < item.quantity) {
        console.error(`Skipping invalid cart item: productId=${item.product?._id || 'missing'}, productName=${item.product?.productName || 'unknown'}, stock=${variant?.Stock}, quantity=${item.quantity}, category=${product?.Category}`);
        continue;
      }

      const { salePrice } = await getProductOffer(product);
      const price = salePrice || variant.Price || 0;
      const originalPrice = variant.Price || 0;
      const quantity = item.quantity;
      const itemTotal = price * quantity;
      const itemDiscount = (originalPrice - price) * quantity;

      orderItems.push({
        product: product._id,
        quantity,
        price,
        ItemTotal: itemTotal,
        ItemDiscount: itemDiscount
      });

      subtotal += itemTotal;
      totalItemDiscount += itemDiscount;

      stockUpdates.push({
        productId: product._id,
        newStock: variant.Stock - item.quantity
      });

      wishlistItemsToRemove.push(product._id);
    }

    if (!orderItems.length) {
      console.log('No valid items after processing for user:', userId);
      return res.status(400).json({ success: false, message: 'No valid items to order. Please check product availability.' });
    }

    let couponDiscount = 0;
    let couponId = null;
    if (coupon) {
      const couponData = await Coupon.findOne({
        CouponCode: coupon.toUpperCase(),
        StartDate: { $lte: new Date() },
        ExpiryDate: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        IsListed: true,
        $or: [{ UserId: null }, { UserId: userId }],
        MinCartValue: { $lte: subtotal }
      }).lean();

      if (couponData) {
        const match = couponData.CouponName.match(/\d+/);
        const discountPercentage = match ? parseInt(match[0], 10) : 0;
        const usageCount = await Orders.countDocuments({ CouponId: couponData._id });
        if (usageCount < couponData.UsageLimit) {
          couponDiscount = subtotal * (discountPercentage / 100);
          couponId = couponData._id;
        }
      }
    }

    const tax = Math.round(subtotal * 0.05);
    const deliveryCharge = 40;
    const finalTotal = subtotal - totalItemDiscount - couponDiscount + tax + deliveryCharge;

    let walletUsedAmount = 0;
    if (paymentMethod === 'Wallet') {
      let wallet = await Wallet.findOne({ UserId: userId });
      if (!wallet) {
        wallet = new Wallet({ UserId: userId, Balance: 0, Transactions: [] });
        await wallet.save();
      }
      if (wallet.Balance < finalTotal) {
        return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
      }
      wallet.Balance -= finalTotal;
      wallet.Transactions.push({
        Type: 'Debit',
        Amount: finalTotal,
        Description: `Payment for order ORD-${Date.now()}`,
        OrderId: `ORD-${Date.now()}`,
        CreatedAt: new Date()
      });
      await wallet.save();
      walletUsedAmount = finalTotal;
    }

    const order = new Orders({
      UserId: userId,
      addressId: selectedAddressId,
      Address: {
        name: selectedAddress.name,
        line1: selectedAddress.line1,
        city: selectedAddress.city,
        state: selectedAddress.state,
        town: selectedAddress.town,
        postCode: selectedAddress.postCode,
        phone: selectedAddress.phone,
        alternativePhone: selectedAddress.alternativePhone
      },
      Items: orderItems,
      OrderDate: new Date(),
      OrderId: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      Status: paymentMethod === 'Online' && razorpayPaymentId ? 'Confirmed' : paymentMethod === 'Wallet' ? 'Confirmed' : 'Pending',
      Subtotal: subtotal,
      TotalItemDiscount: totalItemDiscount,
      CouponDiscount: couponDiscount,
      CouponId: couponId,
      Tax: tax,
      DeliveryCharge: deliveryCharge,
      FinalTotal: finalTotal,
      PaymentMethod: paymentMethod || 'COD',
      RazorpayPaymentId: razorpayPaymentId || null,
      RazorpayOrderId: razorpayOrderId || null,
      RazorpaySignature: razorpaySignature || null,
      WalletUsedAmount: walletUsedAmount
    });

    await order.save();
    console.log('Order created:', { OrderId: order.OrderId, Items: orderItems.length, PaymentMethod: paymentMethod });

    if (wishlistItemsToRemove.length > 0) {
      await Wishlist.deleteMany({ UserId: userId, ProductId: { $in: wishlistItemsToRemove } });
      console.log('Removed from wishlist:', { userId, productIds: wishlistItemsToRemove });
    }

    for (const update of stockUpdates) {
      await Products.updateOne(
        { _id: update.productId },
        { $set: { "Variants.0.Stock": update.newStock } }
      );
    }

    await Cart.findOneAndUpdate({ user: userId }, { Items: [] });

    const fullOrder = await Orders.findById(order._id).populate('Items.product').lean();

    if (paymentMethod === 'Online') {
      const options = {
        amount: finalTotal * 100,
        currency: 'INR',
        receipt: `order_${order._id}`
      };
      const razorpayOrder = await razorpay.orders.create(options);
      return res.json({ success: true, order: { id: razorpayOrder.id, amount: options.amount } });
    }

    res.render('order-success', {
      order: fullOrder,
      orderId: order.OrderId,
      user: await User.findById(userId).lean(),
      activePage: 'orders',
      pageTitle: 'Order Confirmation'
    });
  } catch (err) {
    console.error('Place order error:', err);
    res.status(500).json({ success: false, message: 'Error placing order' });
  }
};

module.exports = { 
  cart,
  getCartData,
  addToCart,
  removeFromCart,
  updateCartQuantity,
  placeOrder
};