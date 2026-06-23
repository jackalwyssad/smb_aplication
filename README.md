# 📁 FileBrowser - SMB Windows File Sharing Web Client

A mobile-friendly, modern web application to browse, stream, download, and manage files on Windows File Sharing servers via SMB2. Accessible directly from your phone or desktop browser.

---

## ✨ Features

- 🔐 **Secure Authentication** — Fast SMB2 credentials verification with JWT-based sessions.
- 💾 **Saved Connections** — Store server profiles locally on your device for quick reconnects.
- 📂 **Rich File Manager** — Android-style grid/list views to navigate directories smoothly.
- 🖼️ **Media Gallery & Viewer** — Image and video thumbnail grids with fullscreen lightboxes.
- 📱 **Gesture Controls** — Mobile-first touch swipe navigation to browse next/previous media.
- 🎬 **Native Video Streaming** — Native HTML5 player with range requests support (supports seamless seeking/buffering without forcing landscape mode).
- ⚡ **Optimized Performance** — Concurrent stat limiters and in-memory thumbnail caching to prevent overloading the SMB server.
- 🌙 **Modern Dark Mode** — Premium, responsive dark interface with glassmorphism effects and smooth transitions.
- ⚙️ **File Operations** — Upload files (with multer), create folders, rename/move, and delete files/directories directly.

---

## 🛠️ Tech Stack

| Layer | Technology | Description |
|---|---|---|
| **Frontend** | React 18 + Vite | Modern fast SPA framework |
| **Styling** | Tailwind CSS + Lucide Icons | Responsive styling and iconography |
| **Backend** | Node.js + Express | REST API server |
| **SMB Client** | `@marsaud/smb2` | Protocol library for Windows File Sharing |
| **Session** | JSON Web Tokens (`jsonwebtoken`) | Stateless auth token exchange |
| **Media Handling** | Multer + mime-types | Multi-part uploads and content-type detection |

---

## 📁 Directory Structure

```
SMTP APK/
├── frontend/                   # React + Vite application
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   │   ├── Breadcrumb.jsx
│   │   │   ├── FileIcon.jsx
│   │   │   ├── FileItem.jsx
│   │   │   ├── LoadingSpinner.jsx
│   │   │   ├── MediaThumbnail.jsx
│   │   │   └── MediaViewer.jsx
│   │   ├── context/
│   │   │   └── AuthContext.jsx  # Global Authentication State
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   └── FileBrowserPage.jsx
│   │   ├── utils/
│   │   │   └── api.js           # Axios base client configuration
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
│
├── backend/                    # Express REST API
│   ├── routes/
│   │   ├── auth.js             # Connection testing, login, session verify
│   │   └── files.js            # Directory lists, stream, upload, file operations
│   ├── middleware/
│   │   └── auth.js             # JWT verification middleware
│   ├── utils/
│   │   └── smb.js              # SMB2 Client connection & methods wrap
│   ├── server.js
│   ├── .env
│   └── package.json
│
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18 or later
- **SMB Server** (Windows File Sharing or Samba server) accessible from the machine hosting the backend.

### 1. Install Dependencies

Install all packages for both the backend and frontend.

**Backend:**
```bash
cd backend
npm install
```

**Frontend:**
```bash
cd frontend
npm install
```

*(Alternatively, run `npm run install:all` in the root folder to install dependencies for both layers simultaneously).*

### 2. Backend Configuration

Create and configure the environment variables file. Copy `backend/.env.example` to `backend/.env`:

```env
PORT=3001
JWT_SECRET=replace-with-a-secure-random-32-character-string
JWT_EXPIRES_IN=24h
CORS_ORIGIN=http://localhost:5173
```

> ⚠️ **Important**: Always secure `JWT_SECRET` in a production environment with a strong random string.

### 3. Run the Development Servers

Open **two terminal windows** or run them in parallel:

**Terminal 1 - Backend API:**
```bash
cd backend
npm run dev
```
The API server will run at `http://localhost:3001`.

**Terminal 2 - Frontend App:**
```bash
cd frontend
npm run dev
```
The client app will run at `http://localhost:5173`.

### 4. Local Network Access (Mobile Devices)

To access the FileBrowser from your smartphone or tablet on the same WiFi network:

1. Identify your computer's local IP address (e.g., `192.168.1.10` on Windows by running `ipconfig`).
2. Open your mobile browser and go to `http://192.168.1.10:5173`.

> 💡 **Tip**: Vite is configured with `--host` to allow incoming local network connections automatically. Make sure your local firewall allows inbound traffic on port `5173` (Vite) and `3001` (Backend).

---

## 🔧 Production Deployment

To package and run the application in a production environment:

1. **Build the Frontend assets:**
   ```bash
   cd frontend
   npm run build
   ```
2. **Serve Built Assets via Express Backend:**
   Ensure static routing is declared in `backend/server.js`:
   ```javascript
   const path = require('path');
   app.use(express.static(path.join(__dirname, '../frontend/dist')));
   app.get('*', (req, res) => {
     res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
   });
   ```
3. **Configure Environment Variables** on your hosting/server provider.

---

## 🔐 Security & Optimization

- **Session Handling**: JWT tokens are securely stored in the client browser's `localStorage` for cross-device compatibility.
- **Protected Endpoints**: All `/api/files/*` route actions require verified token authorization.
- **Media Stream Security**: Temporary JWT token auth via query strings allows native video tags to stream files securely.
- **Rate Limiting**: Built-in protection limiting API traffic to 100 requests per 15 minutes per IP address.
- **HTTP Headers Security**: Helmet.js is integrated on the backend to enforce secure browser headers.
- **Caching**: The server includes an in-memory thumbnail cache (up to 200 items, 10 min TTL) and a concurrency stat queue to prevent slow loading times or performance degradation on SMB servers.

---

## 📝 License

This project is licensed under the MIT License - feel free to use and adapt it.
