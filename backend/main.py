import asyncio
import json
import os
import subprocess
import shutil
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

app = FastAPI()

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionParams(BaseModel):
    host: str
    port: int
    mode: str = "caller"
    latency: int = 1000
    passphrase: str = ""

# Global state
srt_process = None
connected_clients = set()
stats_task = None

async def read_stream(stream):
    while True:
        line = await stream.readline()
        if not line: break
        line_str = line.decode('utf-8').strip()
        
        if '"rtStats"' in line_str or '"link"' in line_str or '"stats"' in line_str:
            try:
                start = line_str.find('{')
                end = line_str.rfind('}') + 1
                full_raw = json.loads(line_str[start:end])
                
                # 1. Extracción de capas con Plan B
                s = full_raw.get("rtStats", full_raw.get("stats", full_raw))
                r = s.get("recv", {})

                # 2. Empaquetado Final Estandarizado
                payload = {
                    "type": "stats",
                    "time": datetime.now().strftime('%H:%M:%S'),
                    "msRTT": s.get("msRTT", s.get("rtt", 0)),
                    "pktLoss": r.get("pktRcvLossTotal", r.get("pktRcvLoss", 0)),
                    "mbps": r.get("mbitRate", 0),
                    "mbpsRetrans": r.get("mbitRateRetrans", s.get("send", {}).get("mbitRateRetrans", 0)),
                    "msJitter": s.get("msJitter", s.get("rttVariance", 0))
                }

                if connected_clients:
                    for client in list(connected_clients):
                        try:
                            await client.send_json(payload)
                        except:
                            connected_clients.discard(client)
            except Exception as e:
                print(f"Error parsing SRT metrics: {e}")
        elif line_str:
            # Mantener los logs para depuración en el dashboard
            log_msg = {"type": "log", "data": line_str}
            if connected_clients:
                for client in list(connected_clients):
                    try:
                        await client.send_json(log_msg)
                    except:
                        connected_clients.discard(client)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.add(websocket)
    try:
        while True:
            # Keep the connection open
            await websocket.receive_text()
    except WebSocketDisconnect:
        connected_clients.remove(websocket)
    except Exception:
        if websocket in connected_clients:
            connected_clients.remove(websocket)

async def probe_stream():
    """Run ffprobe to get stream metadata (resolution, fps, codec) with retry logic."""
    max_retries = 3
    for attempt in range(max_retries):
        await asyncio.sleep(5 + (attempt * 2)) # Increment sleep on retry
        print(f"Probing stream (Attempt {attempt + 1}/{max_retries})...")
        
        cmd = [
            "ffprobe",
            "-v", "error",
            "-analyzeduration", "5000000", # 5 sec
            "-probesize", "5000000",       # 5 MB
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate,codec_name",
            "-of", "json",
            "udp://127.0.0.1:20000?timeout=5000000"
        ]
        
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            stdout, stderr = await proc.communicate()
            if proc.returncode == 0:
                data = json.loads(stdout.decode())
                if "streams" in data and len(data["streams"]) > 0:
                    s = data["streams"][0]
                    width = s.get("width")
                    height = s.get("height")
                    
                    if width and height: # Success!
                        fps_str = s.get("r_frame_rate", "0/0")
                        try:
                            num, den = map(int, fps_str.split('/'))
                            fps = round(num / den) if den > 0 else 0
                        except:
                            fps = 0
                        
                        info = {
                            "type": "identity",
                            "data": {
                                "resolution": f"{width}x{height}",
                                "fps": fps,
                                "codec": s.get("codec_name", "").upper()
                            }
                        }
                        for client in list(connected_clients):
                            try: await client.send_json(info)
                            except: connected_clients.discard(client)
                        return # Exit loop on success
            
            print(f"Probe attempt {attempt + 1} failed, results empty.")
        except Exception as e:
            print(f"Probe attempt {attempt + 1} error: {e}")
    
    info = {
        "type": "identity",
        "data": {
            "resolution": "NO SIGNAL",
            "fps": "-",
            "codec": "OFFLINE"
        }
    }
    for client in list(connected_clients):
        try: await client.send_json(info)
        except: connected_clients.discard(client)
    print("All probe attempts failed. No Signal reported.")

@app.post("/engage")
async def engage(params: ConnectionParams):
    global srt_process, stats_task
    
    # Kill existing process if any
    await stop_srt()
    
    effective_host = params.host if params.host else "0.0.0.0"
    target_uri = f"srt://{effective_host}:{params.port}?mode={params.mode}&latency={params.latency}&conntimeout=5000"
    if params.passphrase:
        target_uri += f"&passphrase={params.passphrase}"

    # Detect SRT binary path automatically
    srt_bin = shutil.which("srt-live-transmit") or "/opt/homebrew/bin/srt-live-transmit"
    
    cmd = [
        srt_bin,
        "-pf", "json",
        "-s", "1000",
        target_uri,
        "udp://127.0.0.1:20000"
    ]

    print(f"Starting SRT: {' '.join(cmd)}")
    
    try:
        srt_process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        stats_task = asyncio.gather(
            read_stream(srt_process.stdout),
            read_stream(srt_process.stderr)
        )
        
        # Trigger stream probe in background
        asyncio.create_task(probe_stream())
        
        return {"status": "success", "pid": srt_process.pid}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/stop")
async def stop():
    await stop_srt()
    return {"status": "stopped"}

async def stop_srt():
    global srt_process, stats_task
    if srt_process:
        try:
            srt_process.terminate()
            await srt_process.wait()
        except Exception:
            pass
        srt_process = None
    
    if stats_task:
        # Task is a gather, we might need a different way to cancel
        pass

@app.get("/health")
async def health():
    return {"status": "ok", "process_running": srt_process is not None and srt_process.returncode is None}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
