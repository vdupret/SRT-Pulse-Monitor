# SRT Real-Time Telemetry Monitor - Walkthrough

## 1. Overview
The **SRT Pulse Monitor** is a professional, high-performance real-time diagnostic tool designed for broadcasters and network engineers. It provides deep visibility into the **Secure Reliable Transport (SRT)** protocol, enabling users to monitor network health, stream stability, and protocol-level metrics with a premium, broadcast-style dashboard.

## 2. Technical Implementation

### Backend (Python/FastAPI)
- **FastAPI Framework:** Drives the core API and WebSocket communication for sub-millisecond telemetry updates.
- **Universal Binary Detection:** Uses `shutil.which` to automatically locate `srt-live-transmit` across macOS, Linux, and Windows environments, ensuring a "zero-config" experience.
- **Asynchronous Processing:** Manages the SRT subprocess using `asyncio.create_subprocess_exec`, capturing `stdout` and `stderr` in real-time without blocking the main loop.
- **Stream Identification (FFprobe):** Integrates an automated probing system with a 5-second timeout. It performs background analysis of the UDP stream to identify resolution, FPS, and codec, providing instant "NO SIGNAL" feedback if the source is offline.
- **CORS Support:** Enabled for local development and integration with web-based frontends.

### Frontend (Vanilla JS / CSS3)
- **High-Contrast Dashboard:** A custom-built UI using CSS Grid/Flexbox inspired by modern "Master Control" room aesthetics.
- **Dynamic Charting:** Utilizes `Chart.js` for dual-axis trend analysis (Bitrate vs. Packet Loss).
- **Interactive Stability Matrix:** A 150-point LED grid that preserves the history of the stream's health.
- **Glow & Pulse Engine:** Custom CSS animations (`critical-pulse`) that trigger 15px glows on failure points, making network drops impossible to ignore.

## 3. Key Features
- **Real-Time Telemetry:** Instant monitoring of RTT, Jitter, Packet Loss, Bitrate, and SRT Overhead.
- **Smart Advisor:** A logic engine that analyzes SRT overhead and suggests latency adjustments in the system logs.
- **Stability Matrix with History:** Visual representation of stream quality over time with high-visibility failure alerts.
- **Automatic Identity Probe:** Detection of video metadata (Width/Height, FPS, Codec).
- **Session Reporting:** Capability to download a validated `.txt` report summarizing session peaks and averages.
- **Multi-Platform Support:** Seamless operation on any OS with SRT installed.

## 4. Metrics & Thresholds (Broadcast Standard)
The monitor applies the following industry-standard logic for 4K/2K transmissions:

| Indicator | Stable (Green) | Degraded (Amber) | Critical (Red) |
|-----------|----------------|------------------|-----------------|
| **RTT** | < 120 ms | 120 - 350 ms | > 350 ms |
| **Jitter** | < 30 ms | 30 - 70 ms | > 70 ms |
| **Loss** | < 1.0 % | 1.0 - 4.0 % | > 4.0 % |
| **Overhead** | < 5 % | 5 - 10 % | > 10 % |

## 5. Verification Results
The platform has been rigorously tested using both simulated data and real SRT peers:
- **Handshake Verification:** Successfully detects and logs the transition from "Connecting" to "Active".
- **"No Signal" Resilience:** Verified that the UI correctly displays "NO SIGNAL" if FFprobe fails to detect a stream within the 5-second window.
- **Alert Accuracy:** Confirmed that the Stability Matrix points trigger the "Critical Pulse" animation exactly when Packet Loss or RTT exceeds the established thresholds.
- **WebSocket Stability:** Sustained low-latency data flow over several minutes of monitoring without disconnects.

## 6. Operational Guide

### Installation
1. Ensure `srt-live-transmit` and `ffprobe` are installed.
2. Initialize environment:
   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

### Running the System
1. **Launch Backend:**
   ```bash
   python main.py
   ```
2. **Access Dashboard:**
   - Open `index.html` in your browser.
3. **Start Monitoring:**
   - Input the peer details and click **ENGAGE**.

### Simulation for Testing
To test the visual alerts (Glows/Pulses) without a real stream, run the mock script:
```bash
python mock_srt.py
```

## 7. Current Progress & Roadmap
- [x] Full transition to FastAPI for high-performance WebSocket telemetry.
- [x] Universal path detection for cross-platform portability.
- [x] Advanced CSS "Critical Glow" for the Stability Matrix.
- [x] Automated identity probe with "No Signal" fallback.
- [x] Session reporting (Proof of Delivery).
- [ ] Support for multiple concurrent monitoring streams.
- [ ] Cloud integration for remote telemetry dashboarding.
