import React, { useState, useEffect } from 'react';
import { 
  Server, User, Lock, Eye, EyeOff, Wifi, LogIn, 
  AlertCircle, FolderOpen, Trash2, Plus, ArrowLeft 
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

const LoginPage = () => {
  const { login } = useAuth();
  
  // State Saved Servers
  const [savedServers, setSavedServers] = useState([]);
  const [showSavedList, setShowSavedList] = useState(true);

  // Form State
  const [form, setForm] = useState({
    host: '',
    share: '',
    username: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Load saved servers on mount
  useEffect(() => {
    try {
      const servers = localStorage.getItem('fb_saved_servers');
      if (servers) {
        const parsed = JSON.parse(servers);
        setSavedServers(parsed);
        // Jika ada server tersimpan, tampilkan list tersimpan secara default
        setShowSavedList(parsed.length > 0);
      } else {
        setShowSavedList(false);
      }
    } catch (_) {
      setShowSavedList(false);
    }
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  // Submit form login baru
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!form.host.trim()) {
      setError('Host/IP server wajib diisi');
      return;
    }
    if (!form.share.trim()) {
      setError('Share Name wajib diisi (nama folder share Windows)');
      return;
    }
    if (!form.username.trim()) {
      setError('Username wajib diisi');
      return;
    }
    if (!form.password) {
      setError('Password wajib diisi');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await login(form.host, form.share, form.username, form.password);
      
      // Simpan server ke daftar tersimpan jika sukses login
      const newServer = {
        host: form.host.trim(),
        share: form.share.trim(),
        username: form.username.trim(),
        password: form.password,
      };

      const updated = savedServers.filter(s => 
        !(s.host === newServer.host && s.share === newServer.share && s.username === newServer.username)
      );
      updated.unshift(newServer);
      setSavedServers(updated);
      localStorage.setItem('fb_saved_servers', JSON.stringify(updated));
    } catch (err) {
      const msg = err.response?.data?.error || 'Koneksi gagal. Silakan coba lagi.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Pilih server yang sudah tersimpan
  const handleSelectServer = async (server) => {
    setIsLoading(true);
    setError('');
    try {
      await login(server.host, server.share, server.username, server.password);
      // Auto-save urutan server ke paling atas jika sukses login ulang
      const updated = savedServers.filter(s => 
        !(s.host === server.host && s.share === server.share && s.username === server.username)
      );
      updated.unshift(server);
      setSavedServers(updated);
      localStorage.setItem('fb_saved_servers', JSON.stringify(updated));
    } catch (err) {
      const msg = err.response?.data?.error || `Gagal terhubung ke ${server.host}: Hubungi server target atau periksa jaringan.`;
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Hapus server dari daftar tersimpan
  const handleDeleteServer = (server, e) => {
    e.stopPropagation(); // Cegah masuk ke proses login
    const updated = savedServers.filter(s => 
      !(s.host === server.host && s.share === server.share && s.username === server.username)
    );
    setSavedServers(updated);
    localStorage.setItem('fb_saved_servers', JSON.stringify(updated));
    if (updated.length === 0) {
      setShowSavedList(false);
    }
  };

  return (
    <div className="min-h-dvh bg-dark-950 flex flex-col items-center justify-center px-5 py-8 safe-top safe-bottom">
      {/* Background gradient */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-accent-600/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-blue-600/8 blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative animate-slide-up">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-500/15 border border-accent-500/20 mb-4 shadow-lg shadow-accent-500/10">
            <Wifi className="w-8 h-8 text-accent-400" strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-bold text-dark-50 mb-1">FileBrowser</h1>
          <p className="text-dark-400 text-xs">Pilih atau Hubungkan Server SMB2</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-4 animate-scale-in">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-300 text-xs leading-relaxed">{error}</p>
          </div>
        )}

        {/* Loading Spinner Overlaid saat menyambung server tersimpan */}
        {isLoading && showSavedList && (
          <div className="card p-8 flex flex-col items-center justify-center min-h-[200px] gap-4">
            <LoadingSpinner size="lg" />
            <p className="text-dark-300 text-xs font-semibold animate-pulse">Menghubungkan ke Server...</p>
          </div>
        )}

        {/* 1. TAMPILAN DAFTAR SERVER TERSIMPAN */}
        {!isLoading && showSavedList && savedServers.length > 0 && (
          <div className="space-y-4">
            <p className="text-dark-500 text-[10px] font-bold uppercase tracking-wider px-1">
              Server Tersimpan ({savedServers.length})
            </p>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {savedServers.map((server, idx) => (
                <div
                  key={idx}
                  onClick={() => handleSelectServer(server)}
                  className="flex items-center gap-3 p-3.5 rounded-2xl bg-dark-900 border border-dark-800/60 hover:bg-dark-850 active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-black/10 group"
                >
                  <div className="p-2.5 rounded-xl bg-dark-800 text-accent-400">
                    <Server className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-dark-100 font-bold text-sm truncate leading-tight">
                      {server.host}
                    </p>
                    <p className="text-dark-500 text-[10px] truncate mt-0.5">
                      Share: {server.share} · User: {server.username}
                    </p>
                  </div>
                  {/* Delete server button */}
                  <button
                    onClick={(e) => handleDeleteServer(server, e)}
                    className="p-2 rounded-xl text-dark-500 hover:text-red-400 hover:bg-red-500/10 active:scale-90 transition-all flex-shrink-0"
                    aria-label="Hapus server"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setError('');
                setShowSavedList(false);
              }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-dark-800 text-dark-400 hover:text-white hover:border-dark-700 active:scale-95 transition-all text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              Hubungkan Server Baru
            </button>
          </div>
        )}

        {/* 2. TAMPILAN FORM LOGIN SERVER BARU */}
        {(!showSavedList || savedServers.length === 0) && !isLoading && (
          <div className="card p-6 shadow-2xl shadow-black/40">
            {savedServers.length > 0 && (
              <button
                onClick={() => {
                  setError('');
                  setShowSavedList(true);
                }}
                className="flex items-center gap-1.5 text-dark-500 hover:text-white text-xs font-semibold mb-5 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Kembali ke Server Tersimpan
              </button>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Host / IP */}
              <div className="space-y-1">
                <label className="text-dark-400 text-[10px] font-bold uppercase tracking-wider">
                  Host / IP Server Windows
                </label>
                <div className="relative">
                  <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500 pointer-events-none" />
                  <input
                    type="text"
                    name="host"
                    value={form.host}
                    onChange={handleChange}
                    placeholder="192.168.1.100 atau PC-SERVER"
                    className="input-field pl-10 text-xs py-2 px-3 rounded-lg"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Share Name */}
              <div className="space-y-1">
                <label className="text-dark-400 text-[10px] font-bold uppercase tracking-wider">
                  Share Name
                </label>
                <div className="relative">
                  <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500 pointer-events-none" />
                  <input
                    type="text"
                    name="share"
                    value={form.share}
                    onChange={handleChange}
                    placeholder="Contoh: Public, SharedFolder, Users"
                    className="input-field pl-10 text-xs py-2 px-3 rounded-lg"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Username */}
              <div className="space-y-1">
                <label className="text-dark-400 text-[10px] font-bold uppercase tracking-wider">
                  Username Windows
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500 pointer-events-none" />
                  <input
                    type="text"
                    name="username"
                    value={form.username}
                    onChange={handleChange}
                    placeholder="Administrator / Guest"
                    className="input-field pl-10 text-xs py-2 px-3 rounded-lg"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label className="text-dark-400 text-[10px] font-bold uppercase tracking-wider">
                  Password Windows
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className="input-field pl-10 pr-10 text-xs py-2 px-3 rounded-lg"
                    autoComplete="current-password"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-dark-500 hover:text-dark-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full mt-3 text-xs py-2.5 rounded-lg font-semibold"
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span>Menghubungkan...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Masuk & Simpan Server</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Info */}
        <p className="text-center text-dark-600 text-[10px] mt-6">
          Windows File Sharing via SMB2 Protocol
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
