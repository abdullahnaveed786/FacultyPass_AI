import numpy as np
import pytest
from app.services.pose_validator import estimate_head_pose, validate_pose_orientation

class MockFace:
    def __init__(self, kps):
        self.kps = kps

def test_estimate_head_pose_center():
    # Mimic a centered face landmarks on a 640x480 canvas
    # [Left eye, Right eye, Nose, Mouth left, Mouth right]
    kps = np.array([
        [297.5, 240.0],
        [342.5, 240.0],
        [320.0, 252.0],
        [305.0, 277.0],
        [335.0, 277.0]
    ], dtype=np.float32)

    yaw, pitch, roll = estimate_head_pose(kps, 640, 480)

    # Perfect frontal face should yield angles close to 0
    assert abs(yaw) < 15.0
    assert abs(pitch) < 15.0
    assert abs(roll) < 15.0

def test_validate_pose_orientation_front():
    kps = np.array([
        [297.5, 240.0],
        [342.5, 240.0],
        [320.0, 252.0],
        [305.0, 277.0],
        [335.0, 277.0]
    ], dtype=np.float32)

    face = MockFace(kps)

    # FRONT should be accepted
    is_valid, msg, (y, p, r) = validate_pose_orientation(face, "FRONT", 640, 480)
    assert is_valid is True
    assert "Validated" in msg

def test_validate_pose_orientation_left_rejected():
    kps = np.array([
        [297.5, 240.0],
        [342.5, 240.0],
        [320.0, 252.0],
        [305.0, 277.0],
        [335.0, 277.0]
    ], dtype=np.float32)

    face = MockFace(kps)

    # When looking straight, checking for "LEFT" should fail (ask to turn head)
    is_valid, msg, (y, p, r) = validate_pose_orientation(face, "LEFT", 640, 480)
    assert is_valid is False
    assert "LEFT" in msg
