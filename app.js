const express = require('express');
const app = express();

        app.use((req, res, next) => {
          res.setHeader("Access-Control-Allow-Origin", "https://2e736e556d49.ngrok-free.app");
          next();
        });
    
const path = require('path');
const env = require('dotenv').config();
const passport = require('passport');
require('./config/passport');
const session = require('express-session');
const nocache = require('nocache'); 
const userRouter = require('./routes/userRouter');
const adminRouter = require('./routes/adminRouter');
const db = require('./config/db');
const flash = require('connect-flash');
const MongoStore = require('connect-mongo');
const morgan = require('morgan');
db();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(nocache());

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  store: MongoStore.create({
    mongoUrl: process.env.Mongodb_uri,
    collectionName: 'sessions'
  }),
  
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});


app.use(flash());

app.use((req, res, next) => {
  res.locals.msg = req.flash('msg'); 
  next();
});


app.set('view engine', 'ejs');
app.set('views', [path.join(__dirname, 'views/user'), path.join(__dirname, 'views/admin')]);
app.use(express.static(path.join(__dirname, 'public')));

app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));
app.use('/', userRouter);
app.use('/admin', adminRouter);

app.listen(3003, () => {
  console.log("Server is running on port 3003");
});

module.exports = app;
