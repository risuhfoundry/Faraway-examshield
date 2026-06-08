# EXAMSHIELD AI Service

Standalone Python microservice for the dashboard AI page.

It streams SSE from `POST /chat`, executes EXAMSHIELD tools locally against the evidence store and core registry, and uses NVIDIA NIM only for planning and natural language generation.

## Run

```powershell
cd C:\Users\anime\Desktop\Far-away\Faraway-examshield\apps\ai-service
$env:NVIDIA_API_KEY="your-nvidia-api-key"
python service.py
```

Default URL: `http://127.0.0.1:8790`

## Endpoints

- `GET /health`
- `GET /tools`
- `POST /chat`

The web dashboard reads `NEXT_PUBLIC_EXAMSHIELD_AI_SERVICE_URL`; if it is not set, it uses `http://127.0.0.1:8790`.

Tool routing and user-facing replies are model-driven. The Python service exposes registered tool schemas to the model, executes the selected tool locally, and streams the final grounded answer from the model using only returned tool fields.

## Environment

```powershell
$env:EXAMSHIELD_AI_HOST="127.0.0.1"
$env:EXAMSHIELD_AI_PORT="8790"
$env:EXAMSHIELD_REPO_ROOT="C:\Users\anime\Desktop\Far-away\Faraway-examshield"
$env:EXAMSHIELD_AI_MODEL="mistralai/ministral-14b-instruct-2512"
$env:NVIDIA_FALLBACK_MODELS="qwen/qwen3-next-80b-a3b-instruct,deepseek-ai/deepseek-v4-flash,meta/llama-4-maverick-17b-128e-instruct"
$env:NVIDIA_NIM_BASE_URL="https://integrate.api.nvidia.com/v1"
```

No memory layer is used here.
