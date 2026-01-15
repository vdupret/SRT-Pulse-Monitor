import time
import json
import random
import sys

def generate_stats():
    bitrate = 5.0 + random.uniform(-1, 1)
    loss = 0.5 + random.uniform(-0.5, 0.5)
    if random.random() > 0.95: # Simulate a burst of loss
        loss += 5.0
    
    rtt = 120 + random.uniform(-10, 10)
    jitter = 5 + random.uniform(-2, 2)
    
    stats = {
        "stats": {
            "link": {
                "rtt_ms": rtt,
                "jitter_ms": jitter
            },
            "send": {
                "m_mbpsBandwidth": bitrate,
                "pktLoss": loss,
                "m_nBufferPkts": random.randint(100, 200)
            }
        }
    }
    return json.dumps(stats)

if __name__ == "__main__":
    print("SRT sample application to transmit live streaming (MOCK)")
    print("Media path: 'udp://127.0.0.1:1234' --> 'udp://127.0.0.1:20000'")
    
    try:
        while True:
            # Stats every 100ms
            print(generate_stats(), file=sys.stderr)
            sys.stderr.flush()
            time.sleep(0.1)
    except KeyboardInterrupt:
        pass
