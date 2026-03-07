"""AI usage registry.

Phase 1 policy:
- Deterministic finance modules never call AI.
- This registry is a placeholder for future non-deterministic narrative features.
"""

AI_CALL_REGISTRY: dict[str, dict[str, object]] = {
    "DASHBOARD_SUMMARY_TEXT": {
        "enabled": False,
        "reason": "Phase 1 excludes AI financial insights",
        "model": "claude-haiku-4-5",
        "max_tokens": 100,
        "cache_ttl": 86400,
    }
}
