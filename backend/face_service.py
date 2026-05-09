from insightface.app import FaceAnalysis
import numpy as np
import cv2
import base64
import os
import uuid
import threading

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

LIVENESS_CHECK = os.getenv("LIVENESS_CHECK", "false").lower() == "true"

_app: FaceAnalysis | None = None
_app_lock = threading.Lock()


def _get_app() -> FaceAnalysis:
    global _app
    if _app is None:
        with _app_lock:
            if _app is None:
                fa = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
                fa.prepare(ctx_id=0, det_size=(640, 640))
                _app = fa
    return _app


def _warmup():
    try:
        _get_app()
        print("[face_service] InsightFace ready")
    except Exception as e:
        print(f"[face_service] Warmup failed: {e}")

threading.Thread(target=_warmup, daemon=True).start()


def _resize_max(img_bgr: np.ndarray, max_dim: int = 640) -> np.ndarray:
    h, w = img_bgr.shape[:2]
    if max(h, w) <= max_dim:
        return img_bgr
    scale = max_dim / max(h, w)
    return cv2.resize(img_bgr, (int(w * scale), int(h * scale)))


def _extract_embedding(img_bgr: np.ndarray) -> list | None:
    """Detect face and return its ArcFace embedding, or None if no face found."""
    try:
        faces = _get_app().get(img_bgr)
        if not faces:
            return None
        face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        return face.embedding.tolist()
    except Exception as e:
        print(f"[face_service] embedding failed: {e}")
        return None


def b64_to_array(b64_str: str) -> np.ndarray:
    if "," in b64_str:
        b64_str = b64_str.split(",")[1]
    data = base64.b64decode(b64_str)
    arr = np.frombuffer(data, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def get_embedding(image_path: str) -> list | None:
    img = cv2.imread(image_path)
    if img is None:
        return None
    return _extract_embedding(_resize_max(img, 640))


def get_embedding_from_array(img_array: np.ndarray) -> list | None:
    if img_array is None:
        return None
    return _extract_embedding(img_array)


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
