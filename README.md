# PULSR ⚡ Multi-Device Live Audio Broadcast & Sync Platform

![PULSR Logo](new.svg)

---

## 🚨 Current Known Issues

1. **On reloading a listener it just stops the audio.**
2. **When host plays the audio through an external app, host play at t=0, but listeners are at some delay**

---

## 🎵 What is PULSR?

**PULSR** is a real-time, multi-device live audio broadcasting and synchronization platform designed to link multiple smartphones, laptops, and speakers over local Wi-Fi into a unified sound system. 

Whether streaming system audio directly from **Spotify**, **Apple Music**, or desktop applications, or playing static MP3/WAV files, PULSR synchronizes playback across all connected listener devices with sample-accurate clock alignment and zero pitch distortion.

---

## ⚙️ How Does It Work? (Architecture & System Overview)

PULSR operates using a high-performance **WebSocket + Media Source Extensions (MSE)** architecture combined with **Cristian's Algorithm** for sub-millisecond clock synchronization.

```
+-----------------------------------------------------------------------------------+
|                                HOST DEVICE                                       |
|  [Spotify / Apple Music / Desktop Audio] -> getDisplayMedia() (System Capture)   |
|                                         |                                         |
|                                         v                                         |
|                                 PulsrLiveStreamer                                 |
|                         MediaRecorder (WebM Opus Chunks)                          |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          | WebSocket (LIVE_AUDIO_CHUNK)
                                          v
+-----------------------------------------------------------------------------------+
|                              PULSR BACKEND SERVER                                 |
|           Node.js WebSocket Server (Port 5001) + MongoDB State Store             |
|                                                                                   |
|  - Caches Chunk #0 (WebM Container Header) for mid-stream joiners                  |
|  - Attaches server timestamping to incoming live chunks                           |
|  - Relays audio chunks to all room sockets                                        |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          | WebSocket (LIVE_AUDIO_CHUNK)
                                          v
+-----------------------------------------------------------------------------------+
|                              LISTENER DEVICES                                     |
|                                                                                   |
|  1. Cristian's Algorithm: Calculates serverTimeOffset via RTT ping bursts          |
|  2. MSE SourceBuffer: Decodes WebM Opus chunks in sequence                        |
|  3. Playback Rate Steering: Continuously adjusts playbackRate (+2%/-2%)           |
|  4. Web Audio API Analyser: Powers real-time reactive visualizer                  |
+-----------------------------------------------------------------------------------+
```

### Key Technical Mechanisms

1. **Live System Audio Capture (`PulsrLiveStreamer.js`)**:
   - Uses WebRTC `navigator.mediaDevices.getDisplayMedia({ audio: true })` to capture Host system audio output directly from Spotify, Apple Music, or Chrome browser tabs.
   - Slices WebM Opus audio chunks every 200ms using W3C `MediaRecorder`.

2. **WebM Header Chunk #0 Caching ([wsHandler.js](file:///Users/ankitjain/Desktop/ResumeProject/pulsR/backend/src/wsHandler.js))**:
   - WebM Opus streams require Chunk #0 (the container header) to initialize the browser's audio decoder.
   - The backend server automatically caches Chunk #0 and immediately dispatches it to any listener joining mid-stream.

3. **High-Precision Clock Sync (Cristian's Algorithm)**:
   - Evaluates Round Trip Time (RTT) and calculates `serverTimeOffset = estimatedServerNow - clientNow`.
   - Filters out network jitter outliers by keeping rolling buffers of the lowest-latency ping samples.

4. **MSE MediaSource Engine (`useLiveAudioStream.js`)**:
   - Streams WebM Opus chunks into an HTML5 `<audio>` element using `MediaSource.addSourceBuffer('audio/webm;codecs=opus')`.
   - Implements smooth proportional `playbackRate` steering ($\pm 2\%$) to maintain stream tip alignment across devices without crackling or decoder buffer flushes.

---

## ⚡ Features

- **Spotify & Apple Music Live Streaming**: Stream live desktop or browser audio directly from host music apps to all listeners in real time.
- **Sub-Millisecond Clock Sync**: High-precision Cristian's algorithm clock synchronization with latency estimation over local Wi-Fi.
- **Mid-Stream Listener Support**: Cached WebM header chunks allow listeners to join active live broadcasts at any time.
- **Ephemeral & Persistent Rooms**: 4-character room codes (`ROOM-A4X9`) with in-memory `Map` state sync and 12-hour MongoDB TTL cleanup.
- **Bluetooth Hardware Calibration**: Interactive slider (`-200ms` to `+200ms`) with info hover tooltip to compensate for Bluetooth speaker hardware delay.
- **Apple Glassmorphism Dark Mode UI**: Clean interface styled in dark zinc with `#c1ff72` lime accents and custom SVG vector logo.
- **Live Reactive Visualizer**: Audio frequency analyzer canvas running on Web Audio API.

---

## 📁 Folder Structure

```
pulsR/
├── package.json                 # Workspace dependencies & root scripts
├── README.md                    # System architecture & documentation
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
│       └── models/
│           ├── Room.js          # Mongoose Room schema
│           └── Track.js         # Mongoose Track schema
└── frontend/                    # Vite + React + Tailwind CSS Client
    ├── package.json             # React, Vite, Tailwind CSS, Lucide icons
    ├── vite.config.js           # Vite dev server with proxy settings
    ├── index.html               # Main HTML entry importing Inter font
    └── src/
        ├── index.css            # Tailwind directives & Apple glassmorphism utilities
        ├── App.jsx              # Main App layout & route manager
        ├── components/
        │   ├── Header.jsx       # Header with new.svg logo, room status, latency, profile editor
        │   ├── RoomJoin.jsx     # Lobby view with new.svg logo, Create/Join Room action cards
        │   ├── Player.jsx       # Apple-style audio player, dropzone uploader & Spotify streamer
        │   ├── DeviceList.jsx   # Connected devices roster with host/listener badges
        │   └── AudioVisualizer.jsx # Real-time reactive frequency canvas visualizer
        ├── hooks/
        │   ├── useWebSocket.js  # WebSocket hook for session & room sync events
        │   ├── useAudioSync.js  # Web Audio API hook with clock drift compensation
        │   └── useLiveAudioStream.js # MSE receiver hook with smooth speed steering
        └── utils/
            └── PulsrLiveStreamer.js # WebRTC system audio capture & MediaRecorder stream
```

---

## 🚀 Setup & Running Instructions

### 1. Install Dependencies
Run the install command from the root directory:
```bash
npm run install:all
```

Or install backend and frontend separately:
```bash
# Backend
cd backend && npm install

# Frontend
cd frontend && npm install
```

### 2. Run Development Mode
Start both backend (Port `5001`) and frontend (Port `5173`) concurrently:
```bash
npm run dev
```

Or run individually:
```bash
# Terminal 1: Backend Server (http://localhost:5001)
npm run dev:backend

# Terminal 2: Frontend Client (http://localhost:5173)
npm run dev:frontend
```

---

## 📖 How to Use

1. Open `http://localhost:5173` on the primary device (**Host**).
2. Click **Create Room** to generate a 4-character room code (e.g. `ROOM-A4X9`).
3. On listener devices connected to the same local Wi-Fi, open `http://<your-computer-ip>:5173` or `http://localhost:5173`.
4. Enter the room code and click **Join**.
5. **Static File Mode**: Drag & drop or upload an MP3/WAV file and press **Play**.
6. **Live Spotify / Apple Music Mode**: Switch to the **Live System Audio** tab, click **Start Live Broadcast**, select your Spotify tab or Desktop Audio, and check **"Share Audio"**.
7. All connected devices will play live sound in synchronization!
