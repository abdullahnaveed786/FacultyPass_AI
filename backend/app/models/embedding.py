import uuid
from sqlalchemy import String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector
from app.database import Base

class TeacherEmbedding(Base):
    __tablename__ = "teacher_embeddings"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    teacher_id: Mapped[str] = mapped_column(
        ForeignKey("teachers.teacher_id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    pose_name: Mapped[str] = mapped_column(String(20), nullable=False)  # 'FRONT', 'LEFT', 'RIGHT', 'UP', 'DOWN'
    embedding: Mapped[list] = mapped_column(Vector(512), nullable=False) # 512-D face embedding vector

    # Relationships
    teacher: Mapped["Teacher"] = relationship("Teacher", back_populates="embeddings")
