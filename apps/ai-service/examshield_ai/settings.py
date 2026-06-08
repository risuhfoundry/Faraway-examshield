from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    repo_root: Path
    upload_root: Path
    registry_path: Path
    api_key: str
    model: str
    fallback_models: tuple[str, ...]
    planner_model: str
    base_url: str
    planner_timeout_seconds: float
    stream_timeout_seconds: float
    cors_origin: str


def load_settings() -> Settings:
    repo_root = Path(os.environ.get("EXAMSHIELD_REPO_ROOT") or Path(__file__).resolve().parents[3]).resolve()
    upload_root = Path(
        os.environ.get("EXAMSHIELD_UPLOAD_ROOT")
        or repo_root / "apps" / "api" / "uploads" / "evidence"
    ).resolve()
    registry_path = Path(
        os.environ.get("EXAMSHIELD_REGISTRY_PATH")
        or repo_root / "apps" / "core" / "data" / "papers.json"
    ).resolve()
    model = (
        os.environ.get("EXAMSHIELD_AI_MODEL")
        or os.environ.get("NVIDIA_MODEL")
        or os.environ.get("NVIDIA_NIM_MODEL")
        or os.environ.get("NIM_MODEL")
        or "meta/llama-4-maverick-17b-128e-instruct"
    ).strip()
    fallback_models = _split_csv(
        os.environ.get("NVIDIA_NIM_FALLBACK_MODELS")
        or os.environ.get("NVIDIA_FALLBACK_MODELS")
        or "mistralai/ministral-14b-instruct-2512,qwen/qwen3-next-80b-a3b-instruct,deepseek-ai/deepseek-v4-flash"
    )

    return Settings(
        host=os.environ.get("EXAMSHIELD_AI_HOST", "127.0.0.1"),
        port=int(os.environ.get("EXAMSHIELD_AI_PORT", "8790")),
        repo_root=repo_root,
        upload_root=upload_root,
        registry_path=registry_path,
        api_key=(
            os.environ.get("NVIDIA_API_KEY")
            or os.environ.get("NVIDIA_NIM_API_KEY")
            or os.environ.get("NIM_API_KEY")
            or ""
        ).strip(),
        model=model,
        fallback_models=fallback_models,
        planner_model=(
            os.environ.get("NVIDIA_NIM_PLANNER_MODEL")
            or os.environ.get("EXAMSHIELD_AI_PLANNER_MODEL")
            or os.environ.get("NVIDIA_PLANNER_MODEL")
            or os.environ.get("NIM_PLANNER_MODEL")
            or model
        ).strip(),
        base_url=(
            os.environ.get("NVIDIA_NIM_BASE_URL")
            or os.environ.get("NVIDIA_BASE_URL")
            or os.environ.get("NIM_BASE_URL")
            or "https://integrate.api.nvidia.com/v1"
        ).rstrip("/"),
        planner_timeout_seconds=float(os.environ.get("EXAMSHIELD_TOOL_PLANNER_TIMEOUT_SECONDS", "8")),
        stream_timeout_seconds=float(os.environ.get("EXAMSHIELD_AI_STREAM_TIMEOUT_SECONDS", "45")),
        cors_origin=os.environ.get("EXAMSHIELD_AI_CORS_ORIGIN", "*"),
    )


def _split_csv(value: str) -> tuple[str, ...]:
    return tuple(item.strip() for item in str(value or "").split(",") if item.strip())
