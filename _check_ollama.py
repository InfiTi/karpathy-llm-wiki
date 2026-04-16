import subprocess, time

# GPU info
try:
    result = subprocess.run(['nvidia-smi', '--query-gpu=memory.used,memory.total,utilization.gpu,temperature.gpu',
                            '--format=csv,noheader,nounits'],
                           capture_output=True, text=True, timeout=5)
    used, total, util, temp = result.stdout.strip().split(',')
    print(f"GPU Memory: {used.strip()} / {total.strip()} MB ({int(used)/int(total)*100:.0f}%)")
    print(f"GPU Util: {util.strip()}%")
    print(f"GPU Temp: {temp.strip()}°C")
except Exception as e:
    print(f"GPU check error: {e}")

# RAM info
try:
    result = subprocess.run(['systeminfo'], capture_output=True, text=True, timeout=10, shell=True)
    for line in result.stdout.split('\n'):
        if 'Available Physical Memory' in line or 'Total Physical Memory' in line:
            print(line.strip())
except Exception as e:
    print(f"RAM check error: {e}")

# Ollama process
print("\n--- Ollama processes ---")
try:
    result = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq ollama*'],
                           capture_output=True, text=True, timeout=5)
    print(result.stdout)
except Exception as e:
    print(e)

# Check Ollama server info
import requests
print("\n--- Ollama /api/version ---")
try:
    r = requests.get('http://localhost:11434/api/version', timeout=5)
    print(f"Status: {r.status_code}, Version: {r.text}")
except Exception as e:
    print(f"Error: {e}")

print("\n--- Ollama /api/tags ---")
try:
    r = requests.get('http://localhost:11434/api/tags', timeout=5)
    import json
    data = r.json()
    models = data.get('models', [])
    for m in models:
        print(f"  {m['name']} ({m['size']//1024**3:.1f} GB)")
except Exception as e:
    print(f"Error: {e}")
