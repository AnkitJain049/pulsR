# PULSR ⚡ Multi-Device Synchronized Audio Playback

PULSR is a web application designed for synchronized audio playback across multiple devices connected over local Wi-Fi.

![PULSR Logo](new.svg)

---

## Features

- **Sub-100ms Synchronized Audio**: High-precision Cristian's algorithm clock synchronization with latency estimation over local Wi-Fi.
- **Web Audio Engine (`PulsrEngine.js`)**: Sample-accurate buffer scheduling with automatic browser autoplay unlock.
- **Ephemeral Rooms & MongoDB**: 4-character room codes (`ROOM-A4X9`) with in-memory `Map` state sync and MongoDB (`pulsR` database) persistence.
- **Apple Minimalist UI**: Clean, decluttered dark mode interface with `#c1ff72` lime accents and given vector logo.
- **Bluetooth Calibration**: Interactive slider (`-200ms` to `+200ms`) with info hover tooltip to compensate for Bluetooth speaker hardware delay.
- **Audio Uploader & Controls**: Upload tracks (MP3/WAV/AAC), play, pause, seek scrubber, volume control, and dynamic live frequency visualizer.
- **Vertical Device Mesh**: Live connected peer roster displaying Host and Listener roles.

---

## Folder Structure

```
pulsR/
├── package.json                 # Root workspace scripts to run backend & frontend
├── README.md                    # Setup and usage guide
├── new.svg                      # Brand vector logo asset (SVG)
├── new.png                      # Brand image logo asset (PNG)
├── backend/                     # Node.js Express + WebSocket Server
│   ├── package.json             # Express, ws, multer, cors, mongoose, dotenv
│   ├── uploads/                 # Static directory storing uploaded audio files
│   └── src/
│       ├── index.js             # Express server entry point & WebSocket attachment
│       ├── db.js                # MongoDB connection module (database: pulsR)
│       ├── roomManager.js       # In-memory Map & MongoDB room state persistence
│       ├── utils.js             # Room code generator ("ROOM-A4X9") & funny username generator
│       ├── wsHandler.js         # WebSocket lifecycle & message dispatcher
│       ├── models/
│       │   ├── Room.js          # Mongoose Room schema
│       │   └── Track.js         # Mongoose Track schema
│       └── routes/
│           ├── rooms.js         # REST endpoints (POST /api/rooms & POST /api/rooms/:roomId/track)
│           └── upload.js        # Express upload route with Multer disk storage
└── frontend/                    # Vite + React + Tailwind CSS Client
    ├── package.json             # React, Vite, Tailwind CSS, Lucide icons
    ├── vite.config.js           # Vite dev server with proxy settings (port 5001)
    ├── tailwind.config.js       # Tailwind configuration (#c1ff72 accent, Inter font)
    ├── index.html               # Main HTML entry importing Inter font
    └── src/
        ├── index.css            # Tailwind directives & Apple glassmorphism utilities
        ├── main.jsx             # React entry point
        ├── App.jsx              # Main App layout & state router
        ├── components/
        │   ├── Header.jsx       # Header with new.svg logo, room status, latency, profile editor
        │   ├── RoomJoin.jsx     # Lobby view with new.svg logo, Create/Join Room action cards
        │   ├── Player.jsx       # Apple-style audio player, dropzone uploader & Bluetooth calibration
        │   ├── DeviceList.jsx   # Connected devices roster with host/listener badges
        │   └── AudioVisualizer.jsx # Real-time reactive frequency canvas visualizer
        ├── hooks/
        │   ├── useWebSocket.js  # WebSocket hook for session & room sync events
        │   └── useAudioSync.js  # Web Audio API hook with clock drift compensation
        └── utils/
            └── PulsrEngine.js   # Precision clock sync (Cristian's algorithm) & Web Audio scheduler
```

---

## Setup & Running Scripts

### 1. Install Dependencies
Run the install command from the root directory to install all packages for root, backend, and frontend:
```bash
npm run install:all
```

Or install separately:
```bash
# In backend/
cd backend && npm install

# In frontend/
cd frontend && npm install
```

### 2. Running in Development Mode
Run both backend and frontend concurrently from the root directory:
```bash
npm run dev
```

Or run them individually in separate terminal windows:
```bash
# Terminal 1: Backend Server (runs on http://localhost:5001)
npm run dev:backend

# Terminal 2: Frontend Client (runs on http://localhost:5173)
npm run dev:frontend
```

---

## Usage Instructions

1. Open `http://localhost:5173` on your primary device (Host).
2. Click **Create Room** to generate a 4-character room code (e.g. `ROOM-A4X9`).
3. On another device connected to the same local Wi-Fi, open `http://<your-computer-ip>:5173` or `http://localhost:5173`.
4. Enter the 4-character room code and click **Join**.
5. As Host, drag & drop or upload an audio track (MP3/WAV/AAC).
6. Press **Play** — audio will stream in sub-100ms synchronization across all connected devices!
