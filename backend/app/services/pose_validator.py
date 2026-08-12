import cv2
import numpy as np
from typing import Tuple, Any

# Standard 3D facial coordinate model points (5 landmarks) in mm.
# Coordinates are relative to a point inside the head.
FACE_3D_POINTS = np.array([
    [-22.5, -9.0, -15.0],      # Left Eye (viewer's left, person's right eye)
    [22.5, -9.0, -15.0],       # Right Eye (viewer's right, person's left eye)
    [0.0, 12.0, 15.0],         # Nose Tip
    [-15.0, 37.0, -10.0],      # Left Mouth Corner
    [15.0, 37.0, -10.0]        # Right Mouth Corner
], dtype=np.float32)

def estimate_head_pose(kps: np.ndarray, img_w: int, img_h: int) -> Tuple[float, float, float]:
    """
    Estimates 3D head pose (Yaw, Pitch, Roll) using OpenCV solvePnP.
    Returns (yaw, pitch, roll) in degrees.
    
    Yaw: Rotation around Y-axis (looking Left/Right). Left is positive, Right is negative.
    Pitch: Rotation around X-axis (looking Up/Down). Up is positive, Down is negative.
    Roll: Rotation around Z-axis (tilting head side-to-side).
    """
    image_points = kps.astype(np.float32)

    # Approximate Camera Matrix (pinhole camera approximation)
    focal_length = img_w
    center = (img_w / 2.0, img_h / 2.0)
    camera_matrix = np.array([
        [focal_length, 0, center[0]],
        [0, focal_length, center[1]],
        [0, 0, 1]
    ], dtype=np.float32)

    # Assuming zero lens distortion
    dist_coeffs = np.zeros((4, 1), dtype=np.float32)

    # solvePnP to find translation and rotation vectors using EPnP (supports 4+ points)
    success, rvec, tvec = cv2.solvePnP(
        FACE_3D_POINTS,
        image_points,
        camera_matrix,
        dist_coeffs,
        flags=cv2.SOLVEPNP_EPNP
    )

    if not success:
        return 0.0, 0.0, 0.0

    # Convert rotation vector to rotation matrix
    rmat, _ = cv2.Rodrigues(rvec)

    # Calculate Euler angles
    sy = np.sqrt(rmat[0, 0] ** 2 + rmat[1, 0] ** 2)
    singular = sy < 1e-6

    if not singular:
        pitch = np.arctan2(rmat[2, 1], rmat[2, 2])
        yaw = np.arctan2(-rmat[2, 0], sy)
        roll = np.arctan2(rmat[1, 0], rmat[0, 0])
    else:
        pitch = np.arctan2(-rmat[1, 2], rmat[1, 1])
        yaw = np.arctan2(-rmat[2, 0], sy)
        roll = 0.0

    # Convert radians to degrees
    yaw_deg = float(np.degrees(yaw))
    pitch_deg = float(np.degrees(pitch))
    roll_deg = float(np.degrees(roll))

    return yaw_deg, pitch_deg, roll_deg

def get_nose_projection(kps: np.ndarray, img_w: int, img_h: int) -> Tuple[Tuple[float, float], Tuple[float, float]]:
    """
    Computes the 2D projected coordinates of the nose vector (origin -> Z-axis)
    to draw a 3D direction pointer on the frontend canvas.
    """
    image_points = kps.astype(np.float32)

    # Approximate Camera Matrix
    focal_length = img_w
    center = (img_w / 2.0, img_h / 2.0)
    camera_matrix = np.array([
        [focal_length, 0, center[0]],
        [0, focal_length, center[1]],
        [0, 0, 1]
    ], dtype=np.float32)

    dist_coeffs = np.zeros((4, 1), dtype=np.float32)

    # solvePnP
    success, rvec, tvec = cv2.solvePnP(
        FACE_3D_POINTS,
        image_points,
        camera_matrix,
        dist_coeffs,
        flags=cv2.SOLVEPNP_EPNP
    )

    if not success:
        return (0.0, 0.0), (0.0, 0.0)

    # 3D points: Origin (0,0,0) and a point 30mm straight out on the Z-axis (0,0,30)
    axis_3d = np.array([
        [0.0, 0.0, 0.0],
        [0.0, 0.0, 35.0]
    ], dtype=np.float32)

    # Project 3D points back onto 2D image plane
    img_pts, _ = cv2.projectPoints(axis_3d, rvec, tvec, camera_matrix, dist_coeffs)

    nose_tip_2d = (float(img_pts[0][0][0]), float(img_pts[0][0][1]))
    nose_pointer_2d = (float(img_pts[1][0][0]), float(img_pts[1][0][1]))

    return nose_tip_2d, nose_pointer_2d


def validate_pose_orientation(face: Any, target_pose: str, img_w: int = 640, img_h: int = 480) -> Tuple[bool, str, Tuple[float, float, float]]:
    """
    Validates face landmarks and computes if they match the desired target pose.
    Returns:
        is_valid (bool): True if pose is validated.
        message (str): Feedback instruction for user.
        metrics (Tuple[float, float, float]): (Yaw, Pitch, Roll) in degrees.
    """
    if not hasattr(face, 'kps') or face.kps is None:
        return False, "Landmarks not detected", (0.0, 0.0, 0.0)

    # Estimate 3D head pose
    yaw, pitch, roll = estimate_head_pose(face.kps, img_w, img_h)

    pose = target_pose.upper().strip()

    # Threshold guidelines for validation (in degrees)
    # Pitch: looking up > 12.0, looking down < -12.0
    # Yaw: looking left > 12.0, looking right < -12.0
    # Roll: tilting should be minimized during capture
    
    if pose in ("FRONT", "FRONT / CENTER"):
        if abs(yaw) > 10.0:
            return False, "Please face the camera directly (reduce horizontal turn).", (yaw, pitch, roll)
        if abs(pitch) > 10.0:
            return False, "Please face the camera directly (reduce vertical tilt).", (yaw, pitch, roll)
        if abs(roll) > 10.0:
            return False, "Please keep your head straight (reduce side roll).", (yaw, pitch, roll)
        return True, "Pose Validated", (yaw, pitch, roll)

    elif pose in ("LEFT", "LOOK LEFT"):
        if yaw < 10.0:
            return False, "Please turn your head slowly to your LEFT.", (yaw, pitch, roll)
        if abs(pitch) > 20.0 or abs(roll) > 20.0:
            return False, "Please keep your head level while looking left.", (yaw, pitch, roll)
        return True, "Pose Validated", (yaw, pitch, roll)

    elif pose in ("RIGHT", "LOOK RIGHT"):
        if yaw > -10.0:
            return False, "Please turn your head slowly to your RIGHT.", (yaw, pitch, roll)
        if abs(pitch) > 20.0 or abs(roll) > 20.0:
            return False, "Please keep your head level while looking right.", (yaw, pitch, roll)
        return True, "Pose Validated", (yaw, pitch, roll)

    elif pose in ("UP", "LOOK UP"):
        if pitch < 10.0:
            return False, "Please tilt your head slowly UPWARDS.", (yaw, pitch, roll)
        if abs(yaw) > 20.0 or abs(roll) > 20.0:
            return False, "Please keep your face centered while looking up.", (yaw, pitch, roll)
        return True, "Pose Validated", (yaw, pitch, roll)

    elif pose in ("DOWN", "LOOK DOWN"):
        if pitch > -10.0:
            return False, "Please tilt your head slowly DOWNWARDS.", (yaw, pitch, roll)
        if abs(yaw) > 20.0 or abs(roll) > 20.0:
            return False, "Please keep your face centered while looking down.", (yaw, pitch, roll)
        return True, "Pose Validated", (yaw, pitch, roll)

    return False, f"Unknown target pose: {target_pose}", (yaw, pitch, roll)
