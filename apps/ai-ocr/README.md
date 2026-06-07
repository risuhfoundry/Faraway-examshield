# EXAMSHIELD OCR Worker

Tiny Python OCR service for Sprint 2.

## Run

```powershell
python worker.py
```

The service listens on `http://127.0.0.1:8765` by default.

## Endpoint

```txt
POST /analyze
```

Send raw image bytes with `Content-Type: image/jpeg` or `image/png`.

Response:

```json
{
  "status": "completed",
  "confidence": 96,
  "text": "Question 1 ...",
  "processingTimeMs": 841
}
```

The worker only performs OCR.

## Quality Gate

The worker runs a small set of Tesseract page segmentation modes, scores the OCR candidates,
and discards low-signal output. Natural photos, blank images, and noisy OCR fragments return:

```json
{
  "status": "completed",
  "confidence": 0,
  "text": "",
  "message": "No Exam Content Detected"
}
```
