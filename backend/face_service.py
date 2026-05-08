from facenet_pytorch import InceptionResnetV1
import numpy as np
import cv2
import base64
import os
import uuid
import threading
import torch

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

LIVENESS_CHECK = os.getenv("LIVENESS_CHECK", "false").lower() == "true"

_CASCADE_PATH = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
_face_cascade = cv2.CascadeClassifier(_CASCADE_PATH)

_model: InceptionResnetV1 | None = None
_model_lock = threading.Lock()


def _get_model() -> InceptionResnetV1:
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                _model = InceptionResnetV1(pretrained="vggface2").eval()
    return _model


def _preprocess(img_bgr: np.ndarray) -> torch.Tensor:
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    img_resized = cv2.resize(img_rgb, (160, 160))
    tensor = torch.tensor(img_resized, dtype=torch.float32).permute(2, 0, 1)
    tensor = (tensor - 127.5) / 128.0
    return tensor.unsqueeze(0)


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
        model = _get_model()
        dummy = torch.zeros(1, 3, 160, 160)
        with torch.no_grad():
            model(dummy)
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


def _compute_embedding(img_bgr: np.ndarray) -> list | None:
    try:
        tensor = _preprocess(img_bgr)
        with torch.no_grad():
            embedding = _get_model()(tensor)
        return embedding[0].tolist()
    except Exception as e:
        print(f"[face_service] embedding failed: {e}")
        return None


def get_embedding(image_path: str) -> list | None:
    img = cv2.imread(image_path)
    if img is None:
        return None

    img = _resize_max(img, 640)
    if not _has_face_opencv(img):
        print("[face_service] No face detected by cascade — rejecting")
        return None

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = _face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))
    if len(faces) > 0:
        x, y, w, h = faces[0]
        pad_x = int(w * 0.2)
        pad_y = int(h * 0.2)
        x1 = max(0, x - pad_x)
        y1 = max(0, y - pad_y)
        x2 = min(img.shape[1], x + w + pad_x)
        y2 = min(img.shape[0], y + h + pad_y)
        img = img[y1:y2, x1:x2]

    return _compute_embedding(img)


def get_embedding_from_array(img_array: np.ndarray) -> list | None:
    if img_array is None:
        return None
    img = _resize_max(img_array, 640)
    # Apply the same Haar-cascade crop used during registration so embeddings
    # are computed on identically-framed face regions in both paths.
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = _face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))
    if len(faces) > 0:
        x, y, w, h = faces[0]
        pad_x = int(w * 0.2)
        pad_y = int(h * 0.2)
        x1 = max(0, x - pad_x)
        y1 = max(0, y - pad_y)
        x2 = min(img.shape[1], x + w + pad_x)
        y2 = min(img.shape[0], y + h + pad_y)
        img = img[y1:y2, x1:x2]
    else:
        print("[face_service] Haar cascade found no face in detect crop; using full crop")
    return _compute_embedding(img)


def is_live_face(img_array: np.ndarray) -> bool:
    if not LIVENESS_CHECK:
        return True
    print("[liveness] Anti-spoofing not available; failing open")
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
