FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/apps/ai-service
ENV PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
ENV FLAGS_use_mkldnn=0
ENV PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT=0
ENV EXAMSHIELD_PADDLE_DET_MODEL=PP-OCRv5_mobile_det
ENV EXAMSHIELD_PADDLE_REC_MODEL=PP-OCRv5_mobile_rec
ENV EXAMSHIELD_PADDLE_WARMUP=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        libgomp1 \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
        libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY apps/ai-service/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY . .

# Pre-download Paddle mobile models at build time so first OCR job does not hit HuggingFace.
RUN python -c "from examshield_ai.paddle_ocr import warmup_paddle_engine; import sys; sys.exit(0 if warmup_paddle_engine(timeout=600) else 1)" \
    || echo "WARN: Paddle model pre-download failed at build; runtime warmup will retry"

CMD ["python", "apps/ai-service/service.py"]
