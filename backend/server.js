require('dotenv').config();

// Safety net — jangan biarkan bug library pihak ketiga crash seluruh server
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION] Server tetap berjalan:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION] Server tetap berjalan:', reason?.message || reason);
});
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Filename']
}));

// Rate limiting - hanya untuk auth routes (login) untuk mencegah brute force
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { error: 'Terlalu banyak permintaan login, coba lagi nanti.' }
});
app.use('/api/auth', limiter);

// Body parser — KECUALI untuk upload-stream yang menggunakan raw piped stream
app.use((req, res, next) => {
  if (req.path === '/api/files/upload-stream') {
    return next(); // Lewati body parser untuk upload stream
  }
  express.json({ limit: '10mb' })(req, res, next);
});
app.use((req, res, next) => {
  if (req.path === '/api/files/upload-stream') {
    return next();
  }
  express.urlencoded({ extended: true })(req, res, next);
});

// Logger (dev only)
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Terjadi kesalahan pada server'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
  console.log(`📁 SMB2 File Browser Backend - v2.0.0`);
});

module.exports = app;
