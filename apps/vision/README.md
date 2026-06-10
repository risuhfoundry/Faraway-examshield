# EXAMSHIELD Vision Stack - Phase 1

YOLO + Supervision + OpenCV image analysis pipeline for EXAMSHIELD.

## Installation

```bash
cd apps/vision
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
```

## Project Structure

```
apps/vision/
├── config.py              # Centralized configuration
├── requirements.txt       # Dependencies
├── models/                # YOLO model files
├── sample_data/           # Test images
├── outputs/               # Annotated images, reports
├── scripts/
│   ├── verify_environment.py   # Check all imports
│   ├── verify_model.py         # Verify model loads
│   ├── detect_image.py         # Full detection pipeline
│   └── benchmark.py            # Performance metrics
└── tests/
    └── test_pipeline.py        # Automated tests
```

## Verification

```bash
# Step 1: Verify environment
python scripts/verify_environment.py

# Step 2: Verify model loads
python scripts/verify_model.py

# Step 3: Run detection pipeline (requires a test image)
python scripts/detect_image.py path/to/image.jpg

# Step 4: Run benchmark
python scripts/benchmark.py
```

## Detection Pipeline

```bash
python scripts/detect_image.py <image_path> [-o output_path] [-c confidence] [-i iou]
```

Flow:
```
Image -> YOLO Detection -> Supervision Annotation -> Saved Output
```

Options:
- `-o, --output`: Output path (default: `outputs/annotated_image.jpg`)
- `-c, --confidence`: Confidence threshold (default: 0.25)
- `-i, --iou`: IoU threshold (default: 0.45)

## Benchmarking

```bash
python scripts/benchmark.py
```

Measures:
- Model load time
- Inference time (avg/min/max/stddev)
- Memory usage
- CPU usage

Results saved to `outputs/benchmark_report.txt`.

## Testing

```bash
pytest tests/ -v
```

## Configuration

All paths and settings are in `config.py`. No hardcoded values in scripts.

## Troubleshooting

**Import errors**: Run `pip install -r requirements.txt`

**Model not found**: `verify_model.py` will auto-download YOLO11n on first run

**Out of memory**: Reduce image size or close other applications
