from app.services.ai_service import AIService
from app.services.artifact_registry_service import ArtifactRegistryService
from app.services.chat_history_service import ChatHistoryService
from app.services.compile_service import CompileService
from app.services.session_service import SessionService
from app.services.upload_service import UploadService

ai_service = AIService()
artifact_registry_service = ArtifactRegistryService()
chat_history_service = ChatHistoryService()
compile_service = CompileService(artifact_registry_service=artifact_registry_service)
session_service = SessionService()
upload_service = UploadService()
