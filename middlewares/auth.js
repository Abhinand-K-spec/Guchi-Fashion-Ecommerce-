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

const adminAuth = async (req, res, next) => {
    try {
        if (!req.session.admin) {
            return res.redirect('/admin/login');
        }

        const adminId = req.session.admin;
        

        const admin = await user.findById(adminId);

        if (admin && admin.isAdmin) {
            return next();
        }
        req.session.admin = null;
        return res.redirect('/admin/login');
    } catch (error) {
        console.log('Error in admin auth middleware:', error);
        return res.status(500).render('page-404');
    }
};

module.exports = {
    userAuth, adminAuth
};