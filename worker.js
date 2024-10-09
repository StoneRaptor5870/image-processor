const sharp = require('sharp');
const axios = require('axios');
const AWS = require('aws-sdk');
const db = require('./db');

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Function to trigger the webhook after processing is complete
async function triggerWebhook(requestId) {
  try {
    await axios.post('https://image-processor-tu7z.onrender.com//webhook', { requestId });
  } catch (err) {
    console.error('Failed to trigger webhook', err);
  }
}

// Function to process images for all products in the request
async function processImages(requestId) {
  const products = await db.query('SELECT * FROM products WHERE request_id = $1', [requestId]);

  if (products.rowCount === 0) {
    console.error(`No products found for requestId ${requestId}`);
    return;
  }

  for (const product of products.rows) {
    console.log(`Processing images for product: ${product.product_name}`);
    const inputUrls = product.input_image_urls.split(',');

    const outputUrls = await Promise.all(
      inputUrls.map(async (url, idx) => {
        try {
          const imageResponse = await axios({ url: url.trim(), responseType: 'arraybuffer' });
          const imageBuffer = Buffer.from(imageResponse.data);

          const outputImage = `output-image-${product.product_name}-${idx}-${Date.now()}.jpg`;

          // Process the image with Sharp
          const processedImageBuffer = await sharp(imageBuffer)
            .jpeg({ quality: 50 })
            .toBuffer();

          // Upload to S3
          const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: outputImage,
            Body: processedImageBuffer,
            ContentType: 'image/jpeg',
          };

          const s3Response = await s3.upload(params).promise();
          return s3Response.Location; // Get the URL of the uploaded image
        } catch (err) {
          console.error(`Failed to process image: ${url} for product: ${product.product_name}`, err);
          return null; // Return null if image fails to process
        }
      })
    );

    const cleanedOutputUrls = outputUrls.filter(url => url !== null);

    if (cleanedOutputUrls.length > 0) {
      await db.query(`UPDATE products SET output_image_urls = $1 WHERE id = $2`, 
        [cleanedOutputUrls.join(', '), product.id]);
    } else {
      // handle no processed images
      console.error(`No images processed successfully for product: ${product.product_name}`);
      await db.query(`UPDATE products SET output_image_urls = $1 WHERE id = $2`, 
        [null, product.id]);
    }
  }

  // Trigger the webhook once done
  await triggerWebhook(requestId);
  console.log(`All products processed for requestId: ${requestId}`);
}

module.exports = { processImages };
