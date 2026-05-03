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
DETECTOR = "opencv"
LIVENESS_CHECK = os.getenv("LIVENESS_CHECK", "false").lower() == "true"


def _warmup():
    """Pre-load Facenet model into memory so the first real request is fast."""
    try:
        dummy = np.zeros((160, 160, 3), dtype=np.uint8)
        DeepFace.represent(dummy, model_name=MODEL_NAME, enforce_detection=False, detector_backend="skip")
        print("[face_service] Model warmed up")
    except Exception as e:
        print(f"[face_service] Warmup failed: {e}")

threading.Thread(target=_warmup, daemon=True).start()


def b64_to_array(b64_str: str) -> np.ndarray:
    """Decode a base64 data-URL to a BGR numpy array (no disk I/O)."""
    if "," in b64_str:
        b64_str = b64_str.split(",")[1]
    data = base64.b64decode(b64_str)
    arr = np.frombuffer(data, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def get_embedding(image_path: str, enforce: bool = True) -> list | None:
    """File-based embedding used during registration (needs accurate face detection)."""
    try:
        result = DeepFace.represent(
            img_path=image_path,
            model_name=MODEL_NAME,
            enforce_detection=enforce,
            detector_backend=DETECTOR,
        )
        return result[0]["embedding"]
    except Exception as e:
        print(f"[face_service] embedding failed (enforce={enforce}): {e}")
        return None


def get_embedding_from_array(img_array: np.ndarray) -> list | None:
    """Embedding from a pre-cropped face crop sent by the frontend.

    Uses enforce_detection=True so a failed detection returns None rather than
    silently embedding the whole image (which produces garbage embeddings that
    never match registered faces).
    """
    try:
        img_rgb = cv2.cvtColor(img_array, cv2.COLOR_BGR2RGB)
        result = DeepFace.represent(
            img_path=img_rgb,
            model_name=MODEL_NAME,
            enforce_detection=True,
            detector_backend=DETECTOR,
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
