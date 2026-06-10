import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import YOLO_MODEL_PATH, DEVICE, MODELS_DIR


def main():
    print("=" * 50)
    print("  EXAMSHIELD Vision - Model Verification")
    print("=" * 50)
    print()

    from ultralytics import YOLO

    print(f"Model path: {YOLO_MODEL_PATH}")
    print(f"Device: {DEVICE}")
    print()

    if not YOLO_MODEL_PATH.exists():
        print(f"Downloading YOLO11n to {MODELS_DIR}...")
        model = YOLO("yolo11n.pt")
        print("Download complete.")
    else:
        print("Model already exists locally.")

    print()
    print("Loading model...")
    start = time.perf_counter()
    try:
        model = YOLO(str(YOLO_MODEL_PATH))
        load_time = time.perf_counter() - start
        print(f"Model loaded in {load_time:.4f}s")
        print(f"Model type: {type(model).__name__}")
        print(f"Model names: {model.names}")
        print()
        print("STATUS: PASS")
    except Exception as e:
        print(f"Model load failed: {e}")
        print()
        print("STATUS: FAIL")
        sys.exit(1)


if __name__ == "__main__":
    main()
