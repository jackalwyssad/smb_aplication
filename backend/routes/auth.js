const express = require('express');
const jwt = require('jsonwebtoken');
const { testSmbConnection } = require('../utils/smb');

const router = express.Router();

/**
 * POST /api/auth/login
 * Login dengan kredensial SMB2 Windows File Sharing
 */
router.post('/login', async (req, res) => {
  const { host, share, username, password } = req.body;

  // Validasi input
  if (!host || !share || !username || !password) {
    return res.status(400).json({
      error: 'Host, Share Name, username, dan password wajib diisi'
    });
  }

  // Validasi format host (IP atau hostname)
  const hostRegex = /^[a-zA-Z0-9._-]+$/;
  if (!hostRegex.test(host)) {
    return res.status(400).json({ error: 'Format host tidak valid' });
  }

  try {
    // Coba koneksi ke SMB2 server
    await testSmbConnection({
      host: host.trim(),
      share: share.trim(),
      username: username.trim(),
      password: password,
      domain: 'WORKGROUP',
    });

    // Koneksi berhasil, buat JWT token
    const payload = {
      host: host.trim(),
      share: share.trim(),
      username: username.trim(),
      password: password,
      domain: 'WORKGROUP',
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    });

    return res.json({
      success: true,
      token,
      user: {
        username: username.trim(),
        host: host.trim(),
        share: share.trim(),
      },
      message: 'Login berhasil'
    });

  } catch (err) {
    console.error('[AUTH] Login failed — message:', err.message);
    console.error('[AUTH] Login failed — code:', err.code);
    console.error('[AUTH] Login failed — stack:', err.stack?.split('\n')[0]);

    const msg = err.message?.toLowerCase() || '';

    const isAuthError =
      msg.includes('logon failure') ||
      msg.includes('access denied') ||
      msg.includes('authentication') ||
      msg.includes('wrong password') ||
      msg.includes('password') ||
      err.code === 'STATUS_LOGON_FAILURE' ||
      err.code === 'STATUS_ACCESS_DENIED';

    const isConnectionError =
      msg.includes('connect') ||
      msg.includes('timeout') ||
      msg.includes('refused') ||
      msg.includes('unreachable') ||
      err.code === 'ECONNREFUSED' ||
      err.code === 'ETIMEDOUT' ||
      err.code === 'ENOTFOUND' ||
      err.code === 'EHOSTUNREACH';

    const isShareError =
      msg.includes('bad network name') ||
      msg.includes('share') ||
      err.code === 'STATUS_BAD_NETWORK_NAME';

    if (isAuthError) {
      return res.status(401).json({
        error: 'Username atau password Windows salah. Silakan coba lagi.'
      });
    } else if (isShareError) {
      return res.status(404).json({
        error: `Share "${share}" tidak ditemukan di server ${host}. Periksa nama folder yang di-share.`
      });
    } else if (isConnectionError) {
      return res.status(503).json({
        error: `Tidak dapat terhubung ke ${host}. Pastikan:\n• Komputer target menyala dan terhubung jaringan\n• File Sharing aktif di Windows\n• Windows Firewall mengizinkan SMB (port 445)`
      });
    } else {
      return res.status(401).json({
        error: `Gagal terhubung: ${err.message}`
      });
    }
  }
});

/**
 * POST /api/auth/verify
 * Verifikasi apakah token masih valid dan server target aktif
 */
router.post('/verify', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ valid: false, error: 'Token tidak ditemukan' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Tes koneksi SMB cepat untuk memastikan server target menyala
    await testSmbConnection({
      host: decoded.host,
      share: decoded.share,
      username: decoded.username,
      password: decoded.password,
      domain: decoded.domain || 'WORKGROUP',
    });

    return res.json({
      valid: true,
      user: {
        username: decoded.username,
        host: decoded.host,
        share: decoded.share,
      }
    });
  } catch (err) {
    return res.status(401).json({ valid: false, error: 'Sesi tidak valid atau server target mati' });
  }
});

/**
 * POST /api/auth/logout
 * Logout (client hanya perlu menghapus token)
 */
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logout berhasil' });
});

module.exports = router;
