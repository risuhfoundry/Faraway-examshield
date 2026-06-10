import sys
import os
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import YOLO_MODEL_PATH, DEVICE, OUTPUTS_DIR


class TestImports:
    def test_ultralytics_imports(self):
        import ultralytics
        assert ultralytics.__version__

    def test_supervision_imports(self):
        import supervision
        assert supervision.__version__

    def test_cv2_imports(self):
        import cv2
        assert cv2.__version__

    def test_numpy_imports(self):
        import numpy
        assert numpy.__version__

    def test_pillow_imports(self):
        from PIL import Image
        assert Image is not None

    def test_psutil_imports(self):
        import psutil
        assert psutil.cpu_percent() >= 0


class TestModelLoading:
    def test_model_loads(self):
        from ultralytics import YOLO
        model = YOLO(str(YOLO_MODEL_PATH))
        assert model is not None

    def test_model_has_names(self):
        from ultralytics import YOLO
        model = YOLO(str(YOLO_MODEL_PATH))
        assert hasattr(model, "names")
        assert len(model.names) > 0


class TestDetection:
    def test_detection_on_random_image(self):
        from ultralytics import YOLO
        import supervision as sv

        model = YOLO(str(YOLO_MODEL_PATH))
        dummy_image = np.random.randint(0, 255, (640, 640, 3), dtype=np.uint8)
        results = model(dummy_image, device=DEVICE)
        assert len(results) > 0

    def test_supervision_detections(self):
        from ultralytics import YOLO
        import supervision as sv

        model = YOLO(str(YOLO_MODEL_PATH))
        dummy_image = np.random.randint(0, 255, (640, 640, 3), dtype=np.uint8)
        results = model(dummy_image, device=DEVICE)[0]
        detections = sv.Detections.from_ultralytics(results)
        assert isinstance(detections, sv.Detections)


class TestOutputGeneration:
    def test_annotator_works(self):
        from ultralytics import YOLO
        import supervision as sv
        import cv2

        model = YOLO(str(YOLO_MODEL_PATH))
        dummy_image = np.random.randint(0, 255, (640, 640, 3), dtype=np.uint8)
        results = model(dummy_image, device=DEVICE)[0]
        detections = sv.Detections.from_ultralytics(results)

        box_annotator = sv.BoxAnnotator()
        annotated = box_annotator.annotate(scene=dummy_image.copy(), detections=detections)
        assert annotated is not None
        assert annotated.shape == dummy_image.shape

    def test_output_saves(self):
        from ultralytics import YOLO
        import supervision as sv
        import cv2

        model = YOLO(str(YOLO_MODEL_PATH))
        dummy_image = np.random.randint(0, 255, (640, 640, 3), dtype=np.uint8)
        results = model(dummy_image, device=DEVICE)[0]
        detections = sv.Detections.from_ultralytics(results)

        box_annotator = sv.BoxAnnotator()
        annotated = box_annotator.annotate(scene=dummy_image.copy(), detections=detections)

        os.makedirs(OUTPUTS_DIR, exist_ok=True)
        output_path = OUTPUTS_DIR / "test_output.jpg"
        cv2.imwrite(str(output_path), annotated)
        assert output_path.exists()
        output_path.unlink()
