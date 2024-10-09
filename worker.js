const sharp = require('sharp')
const axios = require('axios')
const AWS = require('aws-sdk')
const { PassThrough } = require('stream')
const db = require('./db')

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
})

// Function to trigger the webhook after processing is complete
async function triggerWebhook(requestId) {
  try {
    await axios.post('https://image-processor-tu7z.onrender.com/webhook', {
      requestId,
    })
  } catch (err) {
    console.error('Failed to trigger webhook', err)
  }
}

// Stream processing logic for images
async function processImageStream(url, productName, idx) {
  try {
    const imageResponse = await axios({
      url: url.trim(),
      responseType: 'stream',
    })

    const outputImage = `output-image-${productName}-${idx}-${Date.now()}.jpg`

    // Process the image with Sharp using streams
    const processedImageStream = imageResponse.data.pipe(
      sharp().jpeg({ quality: 50 }),
    )

    // Stream upload to S3
    const uploadStream = new PassThrough()
    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: outputImage,
      Body: uploadStream,
      ContentType: 'image/jpeg',
    }

    const s3UploadPromise = s3.upload(params).promise()

    // Pipe processed image stream into S3 upload stream
    processedImageStream.pipe(uploadStream)

    const s3Response = await s3UploadPromise
    return s3Response.Location // Return the URL of the uploaded image
  } catch (err) {
    console.error(
      `Failed to process image: ${url} for product: ${productName}`,
      err,
    )
    return null // Return null if image fails to process
  }
}

// Function to check if products for a requestId are already processed
async function areProductsProcessed(requestId) {
  const result = await db.query(
    "SELECT COUNT(*) AS unprocessed FROM products WHERE request_id = $1 AND (output_image_urls IS NULL OR output_image_urls = '')",
    [requestId],
  )

  return result.rows[0].unprocessed === '0' // Returns true if all products are processed
}

// Function to process images for all products in the request
async function processImages(requestId) {
  // Check if all products are already processed
  const allProcessed = await areProductsProcessed(requestId)

  if (allProcessed) {
    console.log(
      `All products already processed for requestId: ${requestId}. Skipping processing.`,
    )
    await triggerWebhook(requestId) // Still trigger the webhook in case it wasn't triggered earlier
    return
  }

  const batchSize = 25
  let offset = 0
  let totalProcessed = 0
  const processedProductIds = new Set()

  let products

  do {
    console.log(
      `Fetching products with requestId: ${requestId}, batch size: ${batchSize}, offset: ${offset}`,
    )

    // Fetch products in batches to avoid memory overload
    products = await db.query(
      'SELECT * FROM products WHERE request_id = $1 LIMIT $2 OFFSET $3',
      [requestId, batchSize, offset],
    )

    if (products.rowCount === 0) {
      if (offset === 0) {
        // If the first batch returns nothing, log an error
        console.error(`No products found for requestId ${requestId}`)
        return
      } else {
        // No more products left to process
        console.log(
          `All products processed for requestId: ${requestId}. Total processed: ${totalProcessed}`,
        )
        break
      }
    }

    console.log(
      `Fetched ${products.rowCount} products for requestId: ${requestId}`,
    )

    totalProcessed += products.rowCount

    // Process only products that haven't been processed yet
    for (const product of products.rows) {
      if (!processedProductIds.has(product.id)) {
        processedProductIds.add(product.id)
        console.log(`Processing images for product: ${product.product_name}`)
        const inputUrls = product.input_image_urls.split(',')

        const outputUrls = []

        for (let i = 0; i < inputUrls.length; i++) {
          const url = inputUrls[i]
          console.log(
            `Processing image ${i + 1}/${inputUrls.length} for product ${product.product_name}: ${url}`,
          )
          const outputUrl = await processImageStream(
            url,
            product.product_name,
            i,
          )
          if (outputUrl) {
            outputUrls.push(outputUrl)
          }
        }

        if (outputUrls.length > 0) {
          console.log(
            `Updating product ${product.product_name} with output image URLs: ${outputUrls.join(', ')}`,
          )
          await db.query(
            `UPDATE products SET output_image_urls = $1 WHERE id = $2`,
            [outputUrls.join(', '), product.id],
          )
        } else {
          // Handle no processed images
          console.error(
            `No images processed successfully for product: ${product.product_name}`,
          )
          await db.query(
            `UPDATE products SET output_image_urls = $1 WHERE id = $2`,
            [null, product.id],
          )
        }
      }
    }

    offset += batchSize // Move to the next batch
  } while (products.rowCount > 0) // Continue until no more products are fetched

  // Trigger the webhook once done
  await triggerWebhook(requestId)
  console.log(`Processing completed for requestId: ${requestId}`)
}

module.exports = { processImages }
