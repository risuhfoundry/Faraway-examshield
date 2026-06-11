FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True

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

CMD ["python", "apps/ai-service/service.py"]
