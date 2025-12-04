const user = require('../model/userSchema');

const userAuth = (req, res, next) => {
    if (req.session.user) {
        user.findById(req.session.user)
            .then((data) => {
                if (data && !data.isBlocked) {
                    next();
                } else {
                    delete req.session.user;
                    res.redirect('/login?error=Your account has been blocked.');
                }
            })
            .catch((error) => {
                console.log('error in user auth middleware', error);
                res.status(500).send('internal server error');
            });
    } else {
        res.redirect('/login');
    }
};

const adminAuth = (req, res, next) => {
    if (req.session.admin) {
        user.findOne({ isAdmin: true })
            .then((data) => {
                if (data) {
                    next();
                } else {
                    res.redirect('/admin/login');
                }
            })
            .catch((error) => {
                console.log('error in admin auth middleware', error);
                res.status(500).send('Internal server error');
            });
    } else {
        res.redirect('/admin/login');
    }
};

module.exports = {
    userAuth, adminAuth
};