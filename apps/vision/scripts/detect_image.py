import sys
import os
import argparse
import time
import cv2

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import (
    YOLO_MODEL_PATH,
    DEVICE,
    DEFAULT_CONFIDENCE_THRESHOLD,
    DEFAULT_IOU_THRESHOLD,
    ANNOTATED_IMAGE_PATH,
    OUTPUTS_DIR,
)


def run_detection(image_path, output_path=None, confidence=None, iou=None):
    from ultralytics import YOLO
    import supervision as sv

    conf = confidence or DEFAULT_CONFIDENCE_THRESHOLD
    iou_thresh = iou or DEFAULT_IOU_THRESHOLD

    print(f"Image: {image_path}")
    print(f"Model: {YOLO_MODEL_PATH}")
    print(f"Device: {DEVICE}")
    print(f"Confidence: {conf}")
    print(f"IoU: {iou_thresh}")
    print()

    image = cv2.imread(str(image_path))
    if image is None:
        print(f"ERROR: Could not read image at {image_path}")
        sys.exit(1)

    print("Loading model...")
    model = YOLO(str(YOLO_MODEL_PATH))

    print("Running inference...")
    start = time.perf_counter()
    results = model(image, conf=conf, iou=iou_thresh, device=DEVICE)[0]
    inference_time = time.perf_counter() - start
    print(f"Inference completed in {inference_time:.4f}s")

    detections = sv.Detections.from_ultralytics(results)

    print(f"Detected {len(detections)} objects")

    if len(detections) > 0:
        for i, (class_id, score) in enumerate(
            zip(detections.class_id, detections.confidence)
        ):
            label = model.names[class_id]
            print(f"  [{i+1}] {label}: {score:.4f}")

    box_annotator = sv.BoxAnnotator()
    label_annotator = sv.LabelAnnotator()

    labels = [
        f"{model.names[class_id]} {score:.2f}"
        for class_id, score in zip(detections.class_id, detections.confidence)
    ]

    annotated = box_annotator.annotate(scene=image.copy(), detections=detections)
    annotated = label_annotator.annotate(scene=annotated, detections=detections, labels=labels)

    if output_path is None:
        output_path = ANNOTATED_IMAGE_PATH

    output_path = output_path if isinstance(output_path, type(output_path)) else str(output_path)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    cv2.imwrite(output_path, annotated)
    print()
    print(f"Annotated image saved to: {output_path}")

    return {
        "detections": len(detections),
        "inference_time": inference_time,
        "labels": labels,
        "output_path": output_path,
    }


def main():
    parser = argparse.ArgumentParser(description="EXAMSHIELD Vision - Image Detection Pipeline")
    parser.add_argument("image", help="Path to input image")
    parser.add_argument("-o", "--output", help="Path to save annotated image", default=None)
    parser.add_argument("-c", "--confidence", type=float, help="Confidence threshold", default=None)
    parser.add_argument("-i", "--iou", type=float, help="IoU threshold", default=None)
    args = parser.parse_args()

    print("=" * 50)
    print("  EXAMSHIELD Vision - Detection Pipeline")
    print("=" * 50)
    print()

    result = run_detection(args.image, args.output, args.confidence, args.iou)

    print()
    print("Pipeline complete.")
    print(f"  Detections: {result['detections']}")
    print(f"  Inference:  {result['inference_time']:.4f}s")
    print(f"  Output:     {result['output_path']}")


if __name__ == "__main__":
    main()
