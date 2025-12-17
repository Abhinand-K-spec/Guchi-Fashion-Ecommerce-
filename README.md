# Guchi Fashion Ecommerce

A comprehensive E-commerce platform built with Node.js, Express, and MongoDB. This application features a full-fledged shopping experience for users and a robust dashboard for administrators.

##  Features

### User Features
-   **Authentication**: Secure login/signup with Email/Password and Google OAuth.
-   **Product Browsing**: View products with categories, search, and filtering options.
-   **Product Details**: Zoom functionality (using `sharp`), related products, and detailed descriptions.
-   **Shopping Cart**: Add, remove, and update item quantities; stock validation.
-   **Checkout**: Secure checkout process with address management.
-   **Payments**: Integration with **Razorpay** for online payments, plus Wallet support.
-   **Order Management**: View order history, download invoices (PDF), and track order status.
-   **User Profile**: Manage personal details, addresses, and change password.

### Admin Features
-   **Dashboard**: Overview of sales, orders, and products.
-   **Product Management**: Add, edit, delete products; image uploads (stored on Cloudinary).
-   **Category Management**: Manage product categories.
-   **Order Management**: View and update order status (Shipped, Delivered, etc.).
-   **Coupon Management**: Create and manage discount coupons.
-   **Sales Report**: Generate and download sales reports (PDF/Excel).
-   **User Management**: Block/Unblock users.

## Tech Stack

-   **Backend**: Node.js, Express.js
-   **Database**: MongoDB, Mongoose
-   **Templating**: EJS (Embedded JavaScript)
-   **Authentication**: Passport.js (Local & Google Strategy)
-   **Styling**: CSS, Bootstrap 5 (Dark/Light themes)
-   **Image Storage**: Cloudinary (`multer-storage-cloudinary`)
-   **Payment Gateway**: Razorpay
-   **Utilities**: 
    -   `sharp`: Image processing
    -   `pdfkit`: PDF generation
    -   `xlsx`: Excel export
    -   `nodemailer`: Email notifications
    -   `bcrypt`: Password hashing

## Prerequisites

Ensure you have the following installed:
-   **Node.js** (v14+)
-   **MongoDB** (Local or Atlas)

## Installation

1.  **Clone the repository**
    ```bash
    git clone <repository_url>
    cd project1
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Environment Configuration**
    Create a `.env` file in the root directory and add the following variables:

    ```env
    # Server Configuration
    PORT=3000
    SESSION_SECRET=your_session_secret

    # Database
    Mongodb_uri=mongodb://localhost:27017/your_database_name

    # Admin Credentials (if applicable via env)
    # ...

    # Payment Gateway (Razorpay)
    RAZORPAY_KEY_ID=your_razorpay_key_id
    RAZORPAY_KEY_SECRET=your_razorpay_key_secret

    # Email Service (Nodemailer)
    # Note: Variable name as used in codebase
    NODEMIALER_GMAIL=your_gmail_address
    NODEMAILER_PASSWORD=your_gmail_app_password
    # Alternate variable sometimes used:
    # NODEMAILER_GMAIL=your_gmail_address

    # Image Storage (Cloudinary)
    CLOUDINARY_CLOUD_NAME=your_cloud_name
    CLOUDINARY_API_KEY=your_api_key
    CLOUDINARY_API_SECRET=your_api_secret

    # OAuth (Google)
    GOOGLE_CLIENTID=your_google_client_id
    GOOGLE_CLIENT_SECRET=your_google_client_secret
    ```

##  Usage

### Development Mode
Run the application with `nodemon` for hot-reloading:
```bash
npm run dev
```

### Production Mode
Start the application normally:
```bash
npm start
```

### Linting
Check for code issues:
```bash
npm run lint
```
Fix auto-fixable linting issues:
```bash
npm run lint:fix
```

## 📂 Project Structure

```
project1/
├── config/             # Configuration files (DB, Passport, Cloudinary)
├── contoller/          # Route controllers (Admin, User)
├── middlewares/        # Express middlewares (Auth, Uploads)
├── model/              # Mongoose models
├── public/             # Static files (CSS, JS, Images)
├── routes/             # Express routes
├── utils/              # Helper utilities
├── views/              # EJS templates
└── app.js              # Entry point
```

##  License

This project is licensed under the ISC License.
