const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../model/userSchema');
require('dotenv').config();

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENTID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'http://localhost:3003/auth/google/callback'  
},
async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id });
  
      if (!user) {
        user = new User({
          name: profile.displayName,
          email: profile.emails[0].value,
          googleId: profile.id
        });
        await user.save();
      }
  
      // Just pass the user, handle block check in callback route
      return done(null, user);
      
    } catch (error) {
      return done(error, null);
    }
  }));
  

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    User.findById(id)
        .then(user => done(null, user))
        .catch(error => done(error, null));
});

module.exports = passport;
