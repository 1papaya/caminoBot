require('dotenv').config();
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = {
  uploadPhoto: async (photoURL) => {
    return new Promise((res, rej) => {
      cloudinary.uploader.upload(
        photoURL,
        {
          folder: process.env.CLOUDINARY_FOLDER,
          timeout: 8675309,
        },
        (err, result) => {
          if (err) {
            console.log(`${err.message || err}`);
            rej(err);
          } else res(result.secure_url);
        }
      );
    });
  },
};
