require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// Middleware
app.use(cors({
  origin: 'http://localhost:5173', // React dev server
  credentials: true
}));
app.use(express.json({ limit: '10mb' })); // Image URLs
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// MongoDB Schemas
const productSchema = new mongoose.Schema({
  id: { type: Number, unique: true, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  category: { type: String, required: true },
  stock: { type: Number, required: true },
  description: String,
  images: [String]
}, { timestamps: true });

const orderSchema = new mongoose.Schema({
  id: { type: Number, unique: true, required: true },
  userId: String,
  items: [{
    id: Number,
    name: String,
    price: Number,
    quantity: Number,
    images: [String]
  }],
  total: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'shipped', 'delivered', 'cancelled'], default: 'pending' },
  date: { type: Date, default: Date.now },
  shippingAddress: {
    name: String,
    phone: String,
    address: String,
    city: String,
    pincode: String
  }
}, { timestamps: true });

let Product, Order;

const userSchema = new mongoose.Schema({
  id: { type: Number, unique: true, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }
}, { timestamps: true });

let User;


// Connect to MongoDB
mongoose.set('bufferCommands', false);
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ MONGO CONNECTED!');
    
    // Initialize models
    Product = mongoose.model('Product', productSchema);
    Order = mongoose.model('Order', orderSchema);

    // 🔥 PRODUCTS API - COMPLETE CRUD
    app.get('/api/products', async (req, res) => {
      try {
        const products = await Product.find().sort({ id: -1 });
        res.json(products);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.get('/api/products/:id', async (req, res) => {
      try {
        const product = await Product.findOne({ id: parseInt(req.params.id) });
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json(product);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/api/products', async (req, res) => {
      try {
        const productData = { ...req.body, id: Date.now() };
        const product = new Product(productData);
        await product.save();
        res.status(201).json(product);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    app.put('/api/products/:id', async (req, res) => {
      try {
        const product = await Product.findOneAndUpdate(
          { id: parseInt(req.params.id) },
          req.body,
          { new: true }
        );
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json(product);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    app.delete('/api/products/:id', async (req, res) => {
      try {
        await Product.findOneAndDelete({ id: parseInt(req.params.id) });
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 🔥 ORDERS API - COMPLETE CRUD
    app.get('/api/orders', async (req, res) => {
      try {
        const orders = await Order.find().sort({ date: -1 });
        res.json(orders);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/api/orders', async (req, res) => {
      try {
        const orderData = { ...req.body, id: Date.now() };
        const order = new Order(orderData);
        await order.save();
        res.status(201).json(order);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    app.put('/api/orders/:id', async (req, res) => {
      try {
        const order = await Order.findOneAndUpdate(
          { id: parseInt(req.params.id) },
          req.body,
          { new: true }
        );
        if (!order) return res.status(404).json({ error: 'Order not found' });
        res.json(order);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    // Initialize User model
    User = mongoose.model('User', userSchema);

    // REGISTER API
    app.post('/api/auth/register', async (req, res) => {
      try {
        const { name, email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: 'User exists' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const userData = { id: Date.now(), name, email, password: hashedPassword, role: 'user' };
        const user = new User(userData);
        await user.save();  // 🔥 Creates 'users' collection!

        const token = jwt.sign({ id: user.id, email, role: user.role }, 'airawat_secret_2026');
        
        res.json({ token, user: { id: user.id, name, email, role: user.role } });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    // LOGIN API  
    app.post('/api/auth/login', async (req, res) => {
      try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !await bcrypt.compare(password, user.password)) {
          return res.status(400).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, 'airawat_secret_2026');
        res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 🔥 UPDATE PRODUCT STOCK
    // Prevent negative stock in backend too
    app.put('/api/products/:id', async (req, res) => {
      try {
        const product = await Product.findOne({ id: parseInt(req.params.id) });
        if (!product) return res.status(404).json({ error: 'Product not found' });
        
        const newStock = req.body.stock;
        if (newStock < 0) {
          return res.status(400).json({ error: 'Stock cannot be negative' });
        }
        
        const updated = await Product.findOneAndUpdate(
          { id: parseInt(req.params.id) },
          { $set: req.body },
          { new: true }
        );
        res.json(updated);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });





    app.listen(5000, () => {
      console.log('🚀 http://localhost:5000');
    });

  })
  .catch(err => {
    console.error('❌ MONGO ERROR:', err.message);
    process.exit(1);
  });
