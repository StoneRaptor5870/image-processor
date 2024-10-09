const { Pool } = require('pg')
const dotenv = require('dotenv')

dotenv.config()

const pool = new Pool({
  connectionString: process.env.DB,
})

const createTables = async () => {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS requests (
        id SERIAL PRIMARY KEY,
        request_id TEXT UNIQUE,
        status TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        request_id TEXT,
        product_name TEXT,
        input_image_urls TEXT,
        output_image_urls TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `)
  } finally {
    client.release()
  }
}

createTables()

module.exports = pool
