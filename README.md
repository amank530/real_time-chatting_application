# Chatify - Enterprise-Grade Secure Messaging & WebRTC Workspace

**Chatify** is a modern, high-performance, and secure full-stack workspace application. It seamlessly integrates real-time messaging, high-definition peer-to-peer WebRTC video/audio streams, and Google Gemini AI smart assistance into a unified workspace.

Designed with a stunning **Cosmic Slate Theme**, Chatify delivers a polished user experience with robust local persistence, secure Firebase Authentication, and a real-time reactive interface.

---

## 🎨 Visual Identity & Key Themes
- **Cosmic Slate Visual Theme**: Built with a deep charcoal and indigo radial canvas, glowing border panels, customized animated buttons, and smooth micro-interactions powered by `motion` (Framer Motion).
- **Responsive Layout**: Designed for seamless transitions from ultra-wide desktop monitors to compact mobile viewports, ensuring touch targets of at least 44px on mobile devices.
- **Typography & Details**: Features clean typography spacing, using premium display headings paired with high-contrast indicator cards.

---

## 🚀 Key Functional Modules
1. **Secure Phone Authentication & Onboarding**:
   - Implements Firebase Phone Authentication with `RecaptchaVerifier` for production networks.
   - Includes a secure **Sandbox SMS Simulator Fallback** when running in dynamic dev domains or staging sandboxes.
   - Dual-condition registration logic: logs existing phone profiles in directly, or routes new accounts to the customizable avatar profile builder.
   - Anonymous Guest login fallback to instantly experience the workspace.
2. **Real-time Signal & Messaging Engine**:
   - Power-driven by **Socket.io** on the backend and frontend to stream instant messages, active status changes, and dynamic typing events.
   - Fully synced with **Firebase Firestore** to persist chats, groups, call histories, and user sessions.
3. **WebRTC Peer-to-Peer Calls**:
   - Instant video and audio calling with dynamic peer handshake states.
   - Integrated call timers, mute controls, and video toggle states.
4. **Gemini AI Intelligent Assistant**:
   - Integrates the cutting-edge `@google/genai` TypeScript SDK on the server side (Express API proxy) to safely guard secrets.
   - Provides workspace AI summaries, quick actions, and automated replies.

---

## 📂 Project Architecture 
The codebase is structured under clean Model-Node-Controller / full-stack patterns to isolate interests between front-end display and backend orchestration.

```
├── backend/
│   └── server.js               # Express API proxy, Socket.io gateway, and Gemini services
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AdminPanel.jsx        # Admin monitoring & activity logs
│   │   │   ├── AiAssistantPanel.jsx  # chatify AI settings & interface
│   │   │   ├── AuthScreen.jsx        # Secure Phone Auth (SMS/Sandbox OTP)
│   │   │   ├── CallHistoryPanel.jsx  # Log of audio/video peer handshakes
│   │   │   ├── CallWindow.jsx        # WebRTC active media viewports
│   │   │   ├── ChatArea.jsx          # Instant socket message log & UI
│   │   │   └── Sidebar.jsx           # Dynamic active workspace list
│   │   ├── lib/
│   │   │   ├── crypto.js             # Client-side logging and security helpers
│   │   │   └── firebase.js           # Client Firestore & Firebase Auth configs
│   │   ├── App.jsx                   # Central layout and state hub
│   │   ├── index.css                 # Global Tailwind v4 styles & overrides
│   │   └── main.jsx                  # React application root entry
├── firestore.rules             # Secure, audited Firestore DB permission rules
├── firebase-blueprint.json     # Declarative Firebase collections & indices blueprint
├── package.json                # Shared full-stack scripts, backend & frontend packages
└── README.md                   # Comprehensive developer handbook
```

---

## ⚙️ Setup & Deployment Guidelines

### 1. Configure Secrets & Environment Keys
Introduce variables in your `.env` or the AI Studio Environment Panel:
```env
# Dynamic service URL host
APP_URL="https://your-domain.app"
```

### 2. Install Project Dependencies
Run standard package installations to mount Node modules:
```bash
npm install
```

### 3. Run Development Server
Spins up the Express backend (with integrated Vite dev server routing on port `3000` via `tsx`):
```bash
npm run dev
```

### 4. Build for Production
Prepares compiled bundles for distribution. Combines React static production builds in `/dist` and bundles the Express engine into a single CommonJS standalone server at `/dist/server.cjs`:
```bash
npm run build
```

### 5. Start Production Server
Launches the standalone bundled service:
```bash
npm run start
```

