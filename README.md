# Parcel Delivery Notification System

A full-stack web app for managing parcel deliveries. Admins create parcels and generate QR codes; drivers scan QR codes and confirm deliveries with photo proof; the admin dashboard updates in real time via Server-Sent Events.

## Stack

- **Frontend:** React 19 + Vite + TypeScript
- **Backend:** Node.js + Express 5 + TypeScript
- **Database:** SQLite via better-sqlite3 (zero-setup, file-based)
- **Real-time:** Server-Sent Events (SSE)
- **QR codes:** `qrcode` npm package (server-side PNG generation)
- **Charts:** Recharts

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example server/.env
# Edit server/.env — set ADMIN_PASSWORD and SESSION_SECRET
```

### 3. Run in development

```bash
npm run dev
```

This starts both the Express server (port 3000) and Vite dev server (port 5173) concurrently.

- Admin dashboard: http://localhost:5173
- API: http://localhost:3000
- Driver delivery page: http://localhost:5173/deliver/:parcelId

### 4. Build for production

```bash
npm run build
```

Then start the server — it serves the built React app as static files:

```bash
cd server && node dist/index.js
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Express server port |
| `DATABASE_PATH` | `./db.sqlite` | SQLite file path (relative to `server/`) |
| `UPLOADS_DIR` | `./uploads` | Photo storage directory |
| `BASE_URL` | `http://localhost:3000` | Public URL (used in QR code URLs) |
| `ADMIN_PASSWORD` | `changeme` | Admin login password |
| `SESSION_SECRET` | — | Express session secret (use a random string) |

## Usage

### Admin flow

1. Log in at `/login` with your `ADMIN_PASSWORD`
2. Create a parcel via the **+ New Parcel** button
3. Go to **QR Codes** and download or print the QR code for the parcel
4. When a driver scans and confirms delivery, the dashboard shows a toast notification instantly

### Driver flow

1. Scan the QR code on the parcel label
2. The delivery confirmation page opens (no login needed)
3. Take a photo and optionally add notes
4. Tap **Confirm Delivery**

## Deploying on Railway

1. Push code to GitHub
2. New project → Deploy from GitHub repo
3. Add environment variables in the Railway dashboard
4. Set `BASE_URL` to your Railway app URL

## Deploying on Render

1. Create a new Web Service from your GitHub repo
2. **Build command:** `npm install && npm run build`
3. **Start command:** `cd server && node dist/index.js`
4. Add environment variables
5. Add a persistent disk at `/uploads` for photo storage

## Project Structure

```
/
├── server/src/
│   ├── index.ts          # Express app + session + static serving
│   ├── db.ts             # SQLite setup + schema
│   └── routes/
│       ├── parcels.ts    # Admin parcel CRUD (auth required)
│       ├── delivery.ts   # Driver delivery confirmation (public)
│       ├── qr.ts         # QR code PNG generation
│       └── sse.ts        # Server-Sent Events broadcast
├── client/src/
│   ├── App.tsx           # Router + auth state + notification state
│   ├── pages/
│   │   ├── AdminDashboard.tsx   # Main admin view + SSE
│   │   ├── QRGenerator.tsx      # QR code viewer + download
│   │   ├── DriverDelivery.tsx   # Mobile driver form
│   │   └── Login.tsx
│   └── components/
│       ├── ParcelCard.tsx       # Parcel display + lightbox
│       ├── MetricCards.tsx      # Summary metrics row
│       ├── NotificationToast.tsx # Bottom-right toast
│       └── PhotoUpload.tsx      # Camera/gallery picker
└── uploads/              # Proof-of-delivery photos (gitignored)
```
