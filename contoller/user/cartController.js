const Cart = require('../../model/cartSchema');
const User = require('../../model/userSchema');
const Products = require('../../model/productSchema');
const Address = require('../../model/addressSchema');
const Orders = require('../../model/ordersSchema')

  const cart = async (req, res) => {
    try {
      const userId = req.session.user;
     
      const user = await User.findById(userId).lean();
  
      const cartData = await Cart.findOne({ user: userId })
        .populate('items.product')
        .lean();
  
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
      for (const item of cartData.items) {
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
        { $set: { items: validItems } }
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
    
        const cartData = await Cart.findOne({ user: userId }).populate('items.product').lean();
    
        if (!cartData || !cartData.items.length) {
          return res.json({ success: true, cartItems: [], totalPrice: 0 });
        }
    
        let totalPrice = 0;
        const cartItems = cartData.items.map(item => {
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
        cart = new Cart({ user: userId, items: [] });
      }
  
      const index = cart.items.findIndex(item => item.product.toString() === productId);
  
      if (index >= 0) {
        if (cart.items[index].quantity < product.Variants[0].Stock) {
          cart.items[index].quantity += 1;
        } else {
          return res.status(400).json({ error: 'Not enough stock available' });
        }
      } else {
        cart.items.push({ product: productId, quantity: 1 });
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
    
        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        if (!cart) {
          return res.json({ success: false, message: 'Cart not found.' });
        }
    
        const item = cart.items.find(i => String(i.product._id) === String(productId));
        if (!item) {
          console.log(`Item not found: productId=${productId}, cart.items=${JSON.stringify(cart.items.map(i => String(i.product._id)))}`);
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
        const cartItems = cart.items.map(item => {
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
    
        const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);
        if (itemIndex === -1) {
          cart.items.splice(itemIndex, 1);
          await cart.save();
          return res.json({ success: true });
        }
    
        cart.items.splice(itemIndex, 1);
        await cart.save();
    
        res.json({ success: true });
      } catch (err) {
        console.error('Remove cart error:', err);
        res.json({ success: false, message: 'Error removing item from cart' });
      }
    };


      const placeOrder = async (req, res) => {
        try {
          const userId = req.session.user;
          const { selectedAddressId } = req.body;
      
          if (!selectedAddressId) return res.redirect('/checkout');
      
          const cart = await Cart.findOne({ user: userId }).populate('items.product').lean();
          if (!cart || !cart.items.length) return res.redirect('/checkout');
      
          const selectedAddress = await Address.findById(selectedAddressId).lean();
          if (!selectedAddress) return res.status(400).send("Invalid address selected");
      
          const orderItems = [];
          const stockUpdates = [];
      
          for (const item of cart.items) {
            const product = item.product;
            const variant = product?.Variants?.[0];
      
            if (!product || !variant || variant.Stock < item.quantity) continue;
      
            orderItems.push({
              product: product._id,
              quantity: item.quantity,
              price: variant.Price
            });
      
            // Prepare stock update
            stockUpdates.push({
              productId: product._id,
              newStock: variant.Stock - item.quantity
            });
          }
      
          if (orderItems.length === 0) return res.redirect('/cart');
      
          const order = new Orders({
            UserId: userId,
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
            OrderId: `ORD-${Date.now()}`,
            Status: 'Pending'
          });
      
          await order.save();
      
          
          for (const update of stockUpdates) {
            await Products.updateOne(
              { _id: update.productId },
              { $set: { "Variants.0.Stock": update.newStock } }
            );
          }
      
          await Cart.findOneAndUpdate({ user: userId }, { items: [] });
      
          const fullOrder = await Orders.findById(order._id).populate('Items.product').lean();
      
          res.render('order-succes', {
            orderId: order.OrderId 
          });
          
      
        } catch (err) {
          console.error('Place order error:', err);
          res.status(500).render('page-404');
        }
      };
    

module.exports = {
    cart,
    getCartData,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    placeOrder
}