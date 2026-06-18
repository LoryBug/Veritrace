from __future__ import annotations

import os
from pathlib import Path

import dspy
from dotenv import load_dotenv


def configure_dspy() -> None:
    project_root = Path(__file__).resolve().parents[3]
    load_dotenv(project_root / "llm-dspy" / ".env")
    load_dotenv(project_root / "app" / "review-console" / ".env")
    load_dotenv()
    model = os.getenv("DSPY_MODEL", "groq/llama-3.3-70b-versatile")

    # DSPy uses LiteLLM model names for non-OpenAI providers.
    lm = dspy.LM(model, temperature=0.0, max_tokens=2000)
    dspy.configure(lm=lm)
