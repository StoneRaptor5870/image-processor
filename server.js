const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const uuid = require('uuid');
const db = require('./db');
const { processImages } = require('./worker');
const { webhookHandler } = require('./webhook');

const app = express();
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// Upload API: Accept CSV and return request ID
app.post('/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  const requestId = uuid.v4();

  if (!file) {
    return res.status(400).send('No file uploaded.');
  }

  // Validate and parse CSV
  const products = [];
  fs.createReadStream(file.path)
    .pipe(csv())
    .on('data', (row) => {
      const { 'S. No.': serial, 'Product Name': productName, 'Input Image Urls': inputUrls } = row;
      if (!productName || !inputUrls) {
        console.error(`Invalid CSV data: Missing product name or image URLs.`);
        return; // Skip invalid rows
      }
      products.push({ serial, productName, inputUrls });
    })
    .on('end', () => {
      // Store request and products in the database
      db.query(`INSERT INTO requests (request_id, status) VALUES ($1, $2)`, 
        [requestId, 'pending']);

      products.forEach(product => {
        db.query(`INSERT INTO products (request_id, product_name, input_image_urls) VALUES ($1, $2, $3)`,
          [requestId, product.productName, product.inputUrls]);
      });

      // Trigger async image processing for the request
      processImages(requestId);

      res.json({ request_id: requestId });
    });
});

// Status API: Check status using request ID
app.get('/status/:requestId', (req, res) => {
  const requestId = req.params.requestId;

  db.query(`SELECT status FROM requests WHERE request_id = $1`, [requestId])
    .then(result => {
      const row = result.rows[0];
      if (!row) {
        return res.status(404).json({ error: 'Request ID not found' });
      }

      if (row.status === 'completed') {
        db.query(`SELECT product_name, input_image_urls, output_image_urls FROM products WHERE request_id = $1`, [requestId])
          .then(result => {
            res.json({
              status: row.status,
              data: result.rows
            });
          })
          .catch(err => res.status(500).json({ error: err.message }));
      } else {
        res.json({ status: row.status });
      }
    })
    .catch(err => res.status(500).json({ error: err.message }));
});

// Webhook handler
app.post('/webhook', webhookHandler);

app.use("/", (req, res) => {
  res.send("Hello from Image Processor");
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
