# PULSR ⚡ Multi-Device Synchronized Audio Playback

PULSR is a web application designed for synchronized audio playback across multiple devices connected over local Wi-Fi.

![pulsR Logo](/pulsR.svg)

---

## Features

- **Sub-100ms Synchronized Audio**: High-precision time synchronization with clock drift compensation over local Wi-Fi.
- **Ephemeral Room Architecture**: 4-character room codes (`ROOM-A4X9`) managed with an in-memory `Map` backend.
- **Funny Username Generator**: Auto-generated display names (e.g. `Neon Otter 42`, `Groovy Flamingo 88`).
- **Apple Glassmorphism UI**: Premium dark mode UI styled with Google Font **Syne** (ExtraBold 800) and `#c1ff72` lime accents.
- **Audio Uploader & Controls**: Upload tracks (MP3/WAV), play, pause, seek, volume control, and dynamic live frequency visualizer.
- **Device Roster**: Live room member list displaying Host and Listener roles.

---

## Folder Structure

```
pulsR/
├── package.json                 # Root workspace scripts to run backend & frontend
├── README.md                    # Setup and usage guide
├── pulsR.png                    # Brand asset logo (PNG)
├── pulsR.svg                    # Brand asset logo (SVG)
├── backend/                     # Node.js Express + WebSocket Server
│   ├── package.json             # Express, ws, multer, cors dependencies
│   ├── uploads/                 # Static directory storing uploaded audio files
│   └── src/
│       ├── index.js             # Main server entry (Express + static /uploads + WS)
│       ├── roomManager.js       # In-memory Map structure for ephemeral rooms & playback state
│       ├── utils.js             # Room code generator ("ROOM-A4X9") & funny username generator
│       ├── wsHandler.js         # WebSocket lifecycle & message dispatcher
│       └── routes/
│           └── upload.js        # Express upload route with Multer disk storage
└── frontend/                    # Vite + React + Tailwind CSS Client
    ├── package.json             # React, Vite, Tailwind CSS, Lucide icons
    ├── vite.config.js           # Vite dev server with proxy settings
    ├── tailwind.config.js       # Tailwind configuration (#c1ff72 accent, Syne & Inter font)
    ├── index.html               # Main HTML entry importing Syne & Inter fonts
    └── src/
        ├── index.css            # Tailwind directives & Apple glassmorphism utilities
        ├── main.jsx             # React entry point
        ├── App.jsx              # Main App layout & state router
        ├── components/
        │   ├── Header.jsx       # Header with Syne logo, room status, latency, profile editor
        │   ├── RoomJoin.jsx     # Room creation & joining card with username randomizer
        │   ├── Player.jsx       # Apple-style audio player, uploader & playback controls
        │   ├── DeviceList.jsx   # Connected devices roster with host/listener badges
        │   └── AudioVisualizer.jsx # Real-time reactive frequency canvas visualizer
        ├── hooks/
        │   ├── useWebSocket.js  # WebSocket hook for session & room sync events
        │   └── useAudioSync.js  # Web Audio API hook with clock drift compensation
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
# Terminal 1: Backend Server (runs on http://localhost:5000)
npm run dev:backend

# Terminal 2: Frontend Client (runs on http://localhost:5173)
npm run dev:frontend
```

---

## Usage Instructions

1. Open `http://localhost:5173` on your primary device (Host).
2. Click **Create New Room** to generate a 4-character room code (e.g. `ROOM-A4X9`).
3. On another device connected to the same local Wi-Fi, open `http://<your-computer-ip>:5173` or `http://localhost:5173`.
4. Enter the 4-character room code and click **Join Room**.
5. As Host, click **Upload Audio Track** to upload an MP3/WAV file.
6. Press **Play** — audio will stream in sub-100ms synchronization across all connected devices!
