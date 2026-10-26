"""Lightweight breadcrumb log for DI.FM Radio stability debugging.

Keeps a short ring of recent actions so diagnostics and warning logs can say
what the integration was doing before a failure. No listen keys or stream URLs.
"""

from __future__ import annotations

import logging
from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

_LOGGER = logging.getLogger(__name__)

_HISTORY_SIZE = 24


def _utc_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


@dataclass(slots=True)
class ActivityTracker:
    """Record the last meaningful integration actions."""

    last_action: str = "startup"
    last_detail: str = ""
    last_at: str = field(default_factory=_utc_now)
    _history: deque[dict[str, str]] = field(default_factory=lambda: deque(maxlen=_HISTORY_SIZE))

    def note(self, action: str, detail: str = "", *, level: int = logging.INFO) -> None:
        """Record an action and emit a log line."""

        safe_detail = (detail or "").strip()
        self.last_action = action
        self.last_detail = safe_detail
        self.last_at = _utc_now()
        entry = {
            "at": self.last_at,
            "action": action,
            "detail": safe_detail,
        }
        self._history.append(entry)
        if safe_detail:
            _LOGGER.log(level, "DI.FM Radio [%s] %s — %s", self.last_at, action, safe_detail)
        else:
            _LOGGER.log(level, "DI.FM Radio [%s] %s", self.last_at, action)

    def warn_with_context(self, message: str, *args: Any) -> None:
        """Log a warning that includes the last known action."""

        context = self.summary()
        _LOGGER.warning(
            "%s (last action: %s at %s%s)",
            message % args if args else message,
            context["last_action"],
            context["last_at"],
            f", {context['last_detail']}" if context["last_detail"] else "",
        )

    def summary(self) -> dict[str, Any]:
        """Return a diagnostics-safe snapshot of recent activity."""

        return {
            "last_action": self.last_action,
            "last_detail": self.last_detail,
            "last_at": self.last_at,
            "recent": list(self._history),
        }
