const jwt = require('jsonwebtoken');

/**
 * Middleware untuk memverifikasi JWT token dari Authorization header
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  // Token bisa dari header Authorization ATAU query string (untuk img/video src)
  const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

  if (!token) {
    return res.status(401).json({ error: 'Token autentikasi diperlukan' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token sudah kadaluarsa, silakan login kembali' });
    }
    return res.status(403).json({ error: 'Token tidak valid' });
  }
};

module.exports = { authenticateToken };
