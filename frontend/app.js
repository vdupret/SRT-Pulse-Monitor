// SRT Pulse Monitor - Frontend Logic

const state = {
    connected: false,
    ws: null,
    metrics: {
        rtt: [],
        loss: [],
        jitter: [],
        bitrate: []
    },
    maxDataPoints: 50,
    chart: null,
    matrixSize: 150,
    session: {
        startTime: null,
        maxLoss: 0,
        maxBitrate: 0,
        rttValues: [],
        jitterValues: [],
        endTime: null
    }
};

// UI Elements
const engageBtn = document.getElementById('engage-btn');
const downloadBtn = document.getElementById('download-log-btn');
const appStatus = document.getElementById('app-status');
const logOutput = document.getElementById('log-output');
const healthMatrix = document.getElementById('health-matrix');

// Initialize Matrix
function initMatrix() {
    healthMatrix.innerHTML = '';
    for (let i = 0; i < state.matrixSize; i++) {
        const led = document.createElement('div');
        led.className = 'led';
        healthMatrix.appendChild(led);
    }
}

// Initialize Chart
function initChart() {
    const ctx = document.getElementById('telemetryChart').getContext('2d');
    state.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array(state.maxDataPoints).fill(''),
            datasets: [
                {
                    label: 'BITRATE (Mbps)',
                    data: [],
                    borderColor: '#00F0FF',
                    backgroundColor: 'rgba(0, 240, 255, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: 'LOSS (%)',
                    data: [],
                    borderColor: '#FF3131',
                    borderWidth: 2,
                    tension: 0.1,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            elements: { point: { radius: 0 } },
            scales: {
                x: { display: false },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#A0AEC0' }
                },
                y1: {
                    position: 'right',
                    beginAtZero: true,
                    max: 10,
                    grid: { display: false },
                    ticks: { color: '#FF3131' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#FFFFFF', font: { family: 'Outfit' } }
                }
            }
        }
    });
}

// Log Messages
function addLog(msg, type = 'system') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString([], { hour12: false });
    entry.textContent = `[${time}] ${msg}`;
    logOutput.appendChild(entry);
    logOutput.scrollTop = logOutput.scrollHeight;

    // Keep logs manageable
    if (logOutput.children.length > 100) {
        logOutput.removeChild(logOutput.firstChild);
    }
}

// Connect WebSocket
function connectWS() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const port = 8000;

    state.ws = new WebSocket(`${protocol}//${host}:${port}/ws`);

    state.ws.onopen = () => {
        addLog('TELEMETRY CHANNEL OPEN');
    };

    state.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'stats') {
            updateMetrics(msg);
        } else if (msg.type === 'identity') {
            const info = msg.data;
            const infoDiv = document.getElementById('stream-info');
            if (infoDiv) {
                infoDiv.innerHTML = `
                    <h3>STREAM IDENTIFICATION</h3>
                    <div class="info-value">
                        <span style="color: #00F0FF; font-size: 1.2em;">${info.resolution}</span> @ 
                        <span style="color: #FFF;">${info.fps} FPS</span> | 
                        <span style="color: #888;">${info.codec.toUpperCase()}</span>
                    </div>
                `;
            }
        } else if (msg.type === 'log') {
            addLog(msg.data, 'raw');
        }
    };

    state.ws.onclose = () => {
        addLog('TELEMETRY CHANNEL CLOSED', 'error');
        if (state.connected) {
            setTimeout(connectWS, 2000);
        }
    };
}

// Update UI with Metrics
function updateMetrics(flatData) {
    const rtt = parseFloat(flatData.msRTT || flatData.rtt || 0);
    const loss = parseFloat(flatData.pktLoss || flatData.loss || 0);
    const jitter = parseFloat(flatData.msJitter || flatData.jitter || 0);
    const bitrate = parseFloat(flatData.mbps || flatData.bw || 0);

    // Update Session Stats
    if (state.connected) {
        state.session.maxLoss = Math.max(state.session.maxLoss, loss);
        state.session.maxBitrate = Math.max(state.session.maxBitrate, bitrate);
        state.session.rttValues.push(rtt);
        state.session.jitterValues.push(jitter);
    }

    // RTT UI & Color
    const rttEl = document.getElementById('rtt-val');
    rttEl.textContent = Math.round(rtt);
    applyStatusColor(rttEl, rtt, 120, 350);

    // Loss UI & Color
    const lossEl = document.getElementById('loss-val');
    lossEl.textContent = loss.toFixed(2);
    applyStatusColor(lossEl, loss, 1, 4);

    // Jitter UI & Color
    const jitterEl = document.getElementById('jitter-val');
    jitterEl.textContent = Math.round(jitter);
    applyStatusColor(jitterEl, jitter, 30, 70);

    // Bitrate & Overhead
    const retransRate = parseFloat(flatData.mbpsRetrans || 0);

    // useful_bw = total - retrans
    const usefulBw = Math.max(0.1, bitrate - retransRate);
    const overhead = (retransRate / usefulBw) * 100;

    document.getElementById('bitrate-val').textContent = bitrate.toFixed(2);

    const overheadEl = document.getElementById('overhead-val');
    const overheadTrend = document.getElementById('overhead-trend');
    overheadEl.textContent = overhead.toFixed(1);

    if (overhead > 10) {
        overheadEl.className = 'text-bad';
        overheadTrend.textContent = 'HIGH';
        overheadTrend.className = 'trend-indicator text-bad';
        addLog('RECOMENDACIÓN: Incrementar Latencia SRT (Overhead > 10%)', 'error');
    } else if (overhead > 5) {
        overheadEl.className = 'text-warn';
        overheadTrend.textContent = 'STRESS';
        overheadTrend.className = 'trend-indicator text-warn';
    } else {
        overheadEl.className = 'text-good';
        overheadTrend.textContent = 'OPTIMAL';
        overheadTrend.className = 'trend-indicator text-good';
    }

    // Update Chart
    state.chart.data.datasets[0].data.push(bitrate);
    state.chart.data.datasets[1].data.push(loss);

    if (state.chart.data.datasets[0].data.length > state.maxDataPoints) {
        state.chart.data.datasets[0].data.shift();
        state.chart.data.datasets[1].data.shift();
    }
    state.chart.update();

    // Update Matrix
    updateMatrix(loss, rtt, jitter);
}

function applyStatusColor(el, val, warn, bad) {
    el.classList.remove('text-good', 'text-warn', 'text-bad');
    if (val > bad) el.classList.add('text-bad');
    else if (val > warn) el.classList.add('text-warn');
    else el.classList.add('text-good');
}

function updateMatrix(loss, rtt, jitter) {
    const leds = healthMatrix.children;
    // Shift all LEDs one step
    for (let i = state.matrixSize - 1; i > 0; i--) {
        leds[i].className = leds[i - 1].className;
    }

    // New LED status based on refined thresholds
    let status = 'good';
    if (loss > 4 || rtt > 350 || jitter > 70) status = 'bad';
    else if (loss > 1 || rtt > 120 || jitter > 30) status = 'warn';

    leds[0].className = `led ${status}`;
}

// Engage / Stop logic
engageBtn.onclick = async () => {
    if (state.connected) {
        // STOP
        try {
            const res = await fetch('http://localhost:8000/stop', { method: 'POST' });
            if (res.ok) {
                state.connected = false;
                state.session.endTime = new Date();
                engageBtn.classList.remove('stop');
                engageBtn.textContent = 'ENGAGE';
                downloadBtn.style.display = 'block'; // Show download after stop
                appStatus.textContent = 'DISCONNECTED';
                appStatus.classList.remove('active');
                addLog('PROCESS STOPPED BY USER');
            }
        } catch (e) {
            addLog('ERROR STOPPING PROCESS', 'error');
        }
    } else {
        // ENGAGE - RESET SESSION
        state.session = {
            startTime: new Date(),
            maxLoss: 0,
            maxBitrate: 0,
            rttValues: [],
            jitterValues: [],
            endTime: null
        };
        downloadBtn.style.display = 'none';

        const params = {
            host: document.getElementById('host').value,
            port: parseInt(document.getElementById('port').value),
            mode: document.getElementById('mode').value,
            latency: parseInt(document.getElementById('latency').value),
            passphrase: document.getElementById('passphrase').value
        };

        try {
            const res = await fetch('http://localhost:8000/engage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });
            const data = await res.json();
            if (data.status === 'success') {
                state.connected = true;
                engageBtn.classList.add('stop');
                engageBtn.textContent = 'STOP TRANSMIT';
                appStatus.textContent = 'ACTIVE';
                appStatus.classList.add('active');
                addLog(`SRT PROCESS ENGAGED (PID: ${data.pid})`);
                connectWS();
            } else {
                addLog(`FAILED TO START: ${data.message}`, 'error');
            }
        } catch (e) {
            addLog('BACKEND UNREACHABLE', 'error');
        }
    }
};

downloadBtn.onclick = () => {
    const avgRtt = state.session.rttValues.length > 0
        ? state.session.rttValues.reduce((a, b) => a + b, 0) / state.session.rttValues.length
        : 0;

    const avgJitter = state.session.jitterValues.length > 0
        ? state.session.jitterValues.reduce((a, b) => a + b, 0) / state.session.jitterValues.length
        : 0;

    const duration = state.session.endTime
        ? Math.round((state.session.endTime - state.session.startTime) / 1000)
        : 0;

    const report = [
        "SRT PULSE MONITOR - SESSION REPORT",
        "===================================",
        `Date: ${state.session.startTime.toLocaleString()}`,
        `Duration: ${duration} seconds`,
        "-----------------------------------",
        `Average RTT: ${Math.round(avgRtt)} ms`,
        `Average Jitter: ${Math.round(avgJitter)} ms`,
        `Max Packet Loss: ${state.session.maxLoss.toFixed(2)} %`,
        `Peak Bitrate: ${state.session.maxBitrate.toFixed(2)} Mbps`,
        "-----------------------------------",
        "STATUS: PROOF OF DELIVERY",
        "==================================="
    ].join('\n');

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SRT_Session_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('REPORT DOWNLOADED.');
};

// Start
initMatrix();
initChart();
addLog('SYSTEM INITIALIZED');
