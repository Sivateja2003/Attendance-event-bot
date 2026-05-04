from deepface import DeepFace
import numpy as np
import cv2
import base64
import os
import uuid
import threading

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

MODEL_NAME = "Facenet"
LIVENESS_CHECK = os.getenv("LIVENESS_CHECK", "false").lower() == "true"

# Cascade for quick face presence check (no ML needed)
_CASCADE_PATH = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
_face_cascade = cv2.CascadeClassifier(_CASCADE_PATH)


def _has_face_opencv(img_bgr: np.ndarray) -> bool:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    faces = _face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))
    return len(faces) > 0


def _resize_max(img_bgr: np.ndarray, max_dim: int = 640) -> np.ndarray:
    h, w = img_bgr.shape[:2]
    if max(h, w) <= max_dim:
        return img_bgr
    scale = max_dim / max(h, w)
    return cv2.resize(img_bgr, (int(w * scale), int(h * scale)))


def _warmup():
    try:
        dummy = np.zeros((160, 160, 3), dtype=np.uint8)
        DeepFace.represent(dummy, model_name=MODEL_NAME, enforce_detection=False, detector_backend="skip")
        print("[face_service] Model warmed up")
    except Exception as e:
        print(f"[face_service] Warmup failed: {e}")

threading.Thread(target=_warmup, daemon=True).start()


def b64_to_array(b64_str: str) -> np.ndarray:
    if "," in b64_str:
        b64_str = b64_str.split(",")[1]
    data = base64.b64decode(b64_str)
    arr = np.frombuffer(data, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def get_embedding(image_path: str) -> list | None:
    """Registration embedding: OpenCV quick-check for a face, then skip detector for speed."""
    img = cv2.imread(image_path)
    if img is None:
        return None

    # Fast reject: no face found by OpenCV cascade
    img = _resize_max(img, 640)
    if not _has_face_opencv(img):
        print("[face_service] No face detected by cascade — rejecting")
        return None

    # Crop to the first detected face before embedding (faster than letting DeepFace detect)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = _face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))
    if len(faces) > 0:
        x, y, w, h = faces[0]
        # Add 20% padding around the face crop
        pad_x = int(w * 0.2)
        pad_y = int(h * 0.2)
        x1 = max(0, x - pad_x)
        y1 = max(0, y - pad_y)
        x2 = min(img.shape[1], x + w + pad_x)
        y2 = min(img.shape[0], y + h + pad_y)
        img = img[y1:y2, x1:x2]

    try:
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        result = DeepFace.represent(
            img_path=img_rgb,
            model_name=MODEL_NAME,
            enforce_detection=False,
            detector_backend="skip",
        )
        return result[0]["embedding"]
    except Exception as e:
        print(f"[face_service] embedding failed: {e}")
        return None


def get_embedding_from_array(img_array: np.ndarray) -> list | None:
    """Embedding from a pre-cropped face crop sent by the frontend."""
    try:
        img_rgb = cv2.cvtColor(img_array, cv2.COLOR_BGR2RGB)
        result = DeepFace.represent(
            img_path=img_rgb,
            model_name=MODEL_NAME,
            enforce_detection=False,
            detector_backend="skip",
        )
        return result[0]["embedding"]
    except Exception as e:
        print(f"[face_service] array embedding failed: {e}")
        return None


def is_live_face(img_array: np.ndarray) -> bool:
    if not LIVENESS_CHECK:
        return True
    try:
        faces = DeepFace.extract_faces(
            img_path=img_array,
            enforce_detection=False,
            anti_spoofing=True,
        )
        if not faces:
            return True
        result = bool(faces[0].get("is_real", True))
        score = faces[0].get("antispoof_score", None)
        print(f"[liveness] is_real={result} score={score}")
        return result
    except Exception as e:
        print(f"[liveness] check error (fail open): {e}")
        return True


def save_base64_image(b64_str: str) -> str:
    if "," in b64_str:
        b64_str = b64_str.split(",")[1]
    data = base64.b64decode(b64_str)
    path = os.path.join(UPLOAD_DIR, f"tmp_{uuid.uuid4().hex}.jpg")
    with open(path, "wb") as f:
        f.write(data)
    return path


def save_upload_bytes(file_bytes: bytes, original_name: str) -> tuple[str, str]:
    ext = os.path.splitext(original_name)[1] or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, filename)
    with open(path, "wb") as f:
        f.write(file_bytes)
    return path, filename
