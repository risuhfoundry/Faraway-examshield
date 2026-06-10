import sys
import os
import time
import statistics

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import (
    YOLO_MODEL_PATH,
    DEVICE,
    OUTPUTS_DIR,
    BENCHMARK_REPORT_PATH,
    BENCHMARK_NUM_RUNS,
)


def get_memory_usage():
    import psutil
    process = psutil.Process()
    mem = process.memory_info()
    return mem.rss / (1024 * 1024)


def get_cpu_usage():
    import psutil
    return psutil.cpu_percent(interval=None)


def run_benchmark():
    import cv2
    import numpy as np
    from ultralytics import YOLO

    print("=" * 50)
    print("  EXAMSHIELD Vision - Benchmark")
    print("=" * 50)
    print()

    print(f"Model: {YOLO_MODEL_PATH}")
    print(f"Device: {DEVICE}")
    print(f"Runs: {BENCHMARK_NUM_RUNS}")
    print()

    dummy_image = np.random.randint(0, 255, (640, 640, 3), dtype=np.uint8)

    print("Warming up (1 run)...")
    model = YOLO(str(YOLO_MODEL_PATH))
    model(dummy_image, device=DEVICE)

    print("Measuring model load times...")
    load_times = []
    for _ in range(BENCHMARK_NUM_RUNS):
        start = time.perf_counter()
        _ = YOLO(str(YOLO_MODEL_PATH))
        load_times.append(time.perf_counter() - start)

    print("Measuring inference times...")
    inference_times = []
    memory_before = get_memory_usage()
    cpu_before = get_cpu_usage()
    for _ in range(BENCHMARK_NUM_RUNS):
        start = time.perf_counter()
        model(dummy_image, device=DEVICE)
        inference_times.append(time.perf_counter() - start)

    memory_after = get_memory_usage()
    cpu_after = get_cpu_usage()

    avg_load = statistics.mean(load_times)
    min_load = min(load_times)
    max_load = max(load_times)

    avg_infer = statistics.mean(inference_times)
    min_infer = min(inference_times)
    max_infer = max(inference_times)
    stdev_infer = statistics.stdev(inference_times) if len(inference_times) > 1 else 0

    model_name = YOLO_MODEL_PATH.name
    report_lines = [
        "=" * 50,
        "  EXAMSHIELD Vision - Benchmark Report",
        "=" * 50,
        "",
        f"Model:           {model_name}",
        f"Device:          {DEVICE}",
        f"Image Size:      640x640",
        f"Number of Runs:  {BENCHMARK_NUM_RUNS}",
        "",
        "--- Model Load Time ---",
        f"  Average:  {avg_load:.4f}s",
        f"  Min:      {min_load:.4f}s",
        f"  Max:      {max_load:.4f}s",
        "",
        "--- Inference Time ---",
        f"  Average:  {avg_infer:.4f}s",
        f"  Min:      {min_infer:.4f}s",
        f"  Max:      {max_infer:.4f}s",
        f"  Std Dev:  {stdev_infer:.4f}s",
        "",
        "--- Memory Usage ---",
        f"  Before:   {memory_before:.2f} MB",
        f"  After:    {memory_after:.2f} MB",
        f"  Delta:    {memory_after - memory_before:.2f} MB",
        "",
        "--- CPU Usage ---",
        f"  Before:   {cpu_before:.1f}%",
        f"  After:    {cpu_after:.1f}%",
        "",
        "=" * 50,
    ]

    report_text = "\n".join(report_lines)

    print()
    print(report_text)

    os.makedirs(OUTPUTS_DIR, exist_ok=True)
    with open(str(BENCHMARK_REPORT_PATH), "w") as f:
        f.write(report_text)

    print()
    print(f"Report saved to: {BENCHMARK_REPORT_PATH}")

    return {
        "avg_load": avg_load,
        "avg_inference": avg_infer,
        "memory_delta": memory_after - memory_before,
    }


def main():
    run_benchmark()


if __name__ == "__main__":
    main()
