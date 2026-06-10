import sys
import os
import time
import cv2

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import (
    YOLO_MODEL_PATH,
    DEVICE,
    DEFAULT_CONFIDENCE_THRESHOLD,
    DEFAULT_IOU_THRESHOLD,
    WEBCAM_INDEX,
    WEBCAM_WIDTH,
    WEBCAM_HEIGHT,
)


def main():
    from ultralytics import YOLO
    import supervision as sv

    model = YOLO(str(YOLO_MODEL_PATH))
    box_annotator = sv.BoxAnnotator()
    label_annotator = sv.LabelAnnotator()

    cap = cv2.VideoCapture(WEBCAM_INDEX)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, WEBCAM_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, WEBCAM_HEIGHT)

    if not cap.isOpened():
        print("ERROR: Cannot open webcam")
        sys.exit(1)

    print("Webcam opened. Press 'q' to quit.")
    print(f"Resolution: {int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}")
    print()

    fps_counter = 0
    fps_time = time.perf_counter()
    fps_display = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            print("Failed to grab frame")
            break

        results = model(frame, conf=DEFAULT_CONFIDENCE_THRESHOLD, iou=DEFAULT_IOU_THRESHOLD, device=DEVICE)[0]
        detections = sv.Detections.from_ultralytics(results)

        labels = [
            f"{model.names[class_id]} {score:.2f}"
            for class_id, score in zip(detections.class_id, detections.confidence)
        ]

        annotated = box_annotator.annotate(scene=frame.copy(), detections=detections)
        annotated = label_annotator.annotate(scene=annotated, detections=detections, labels=labels)

        fps_counter += 1
        now = time.perf_counter()
        if now - fps_time >= 1.0:
            fps_display = fps_counter / (now - fps_time)
            fps_counter = 0
            fps_time = now

        cv2.putText(annotated, f"FPS: {fps_display:.1f}", (10, 30),
                     cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        cv2.putText(annotated, f"Objects: {len(detections)}", (10, 65),
                     cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

        cv2.imshow("EXAMSHIELD - Realtime Detection", annotated)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
    print("Webcam closed.")


if __name__ == "__main__":
    main()
