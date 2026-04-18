const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ Kết nối PostgreSQL thành công');
    client.release();
  } catch (err) {
    console.error('❌ Không thể kết nối PostgreSQL:', err.message);
    console.error('   Kiểm tra lại .env: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD');
  }
}

module.exports = { pool, testConnection };
