import numpy as np
from typing import List, Tuple, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.teacher import Teacher
from app.models.embedding import TeacherEmbedding
from app.config import settings

def normalize_vector(emb: np.ndarray) -> np.ndarray:
    """L2 normalizes a 512-D vector."""
    norm = np.linalg.norm(emb)
    if norm > 0:
        return emb / norm
    return emb

async def check_biometric_duplicate(
    new_embeddings: List[np.ndarray], 
    db: AsyncSession,
    threshold: float = None
) -> Tuple[bool, Optional[Teacher], float]:
    """
    Compares 5 new pose vectors against ALL stored vectors in the DB using pgvector.
    Returns (is_duplicate, matched_teacher_orm, highest_similarity_score).
    """
    if threshold is None:
        threshold = settings.DUPLICATE_THRESHOLD

    highest_score = -1.0
    matched_teacher = None

    for emb in new_embeddings:
        normalized_emb = normalize_vector(emb).tolist()
        
        # Query pgvector for the single closest embedding to this pose
        stmt = select(
            TeacherEmbedding.teacher_id,
            (1 - TeacherEmbedding.embedding.cosine_distance(normalized_emb)).label("similarity")
        ).order_by(TeacherEmbedding.embedding.cosine_distance(normalized_emb)).limit(1)

        result = await db.execute(stmt)
        row = result.first()

        if row:
            sim = float(row.similarity)
            if sim > highest_score:
                highest_score = sim
                # Fetch teacher profile
                teacher_stmt = select(Teacher).where(Teacher.teacher_id == row.teacher_id)
                t_result = await db.execute(teacher_stmt)
                matched_teacher = t_result.scalar_one_or_none()

    if highest_score >= threshold:
        return True, matched_teacher, highest_score

    return False, None, highest_score

async def identify_teacher_from_vector(
    query_vector: np.ndarray,
    db: AsyncSession,
    threshold: float = None
) -> Tuple[Optional[Teacher], Optional[str], float]:
    """
    Identifies a query vector against database embeddings.
    Returns (teacher, matched_pose_name, similarity_score).
    """
    if threshold is None:
        threshold = settings.BIOMETRIC_THRESHOLD

    normalized_query = normalize_vector(query_vector).tolist()

    # Query the single closest vector match in the database
    stmt = select(
        TeacherEmbedding.teacher_id,
        TeacherEmbedding.pose_name,
        (1 - TeacherEmbedding.embedding.cosine_distance(normalized_query)).label("similarity")
    ).order_by(TeacherEmbedding.embedding.cosine_distance(normalized_query)).limit(1)

    result = await db.execute(stmt)
    row = result.first()

    if row:
        similarity = float(row.similarity)
        if similarity >= threshold:
            teacher_stmt = select(Teacher).where(
                Teacher.teacher_id == row.teacher_id,
                Teacher.is_active == True
            )
            t_result = await db.execute(teacher_stmt)
            teacher = t_result.scalar_one_or_none()
            if teacher:
                return teacher, row.pose_name, similarity

    return None, None, 0.0
