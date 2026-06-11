from __future__ import annotations

from .store import JsonObject


def conversation_messages(prompt: str, history: list[JsonObject]) -> list[JsonObject]:
    return [
        {
            "role": "system",
            "content": (
                "You are EXAMSHIELD AI, a national examination security analyst. "
                "Respond naturally in plain language. Be concise and direct — like a colleague, not a chatbot. "
                "Do not claim live evidence, alerts, papers, or report facts unless a tool result is provided. "
                "You can discuss general EXAMSHIELD concepts, how the system works, or anything else the investigator asks."
            ),
        },
        *history_messages(history),
        {"role": "user", "content": prompt},
    ]


def grounded_messages(prompt: str, history: list[JsonObject], tool_context: str) -> list[JsonObject]:
    return [
        {
            "role": "system",
            "content": (
                "You are EXAMSHIELD AI, a national examination security analyst helping an investigator. "
                "A tool just returned live data about the investigation. Use ONLY that data to answer naturally. "
                "Speak like a knowledgeable colleague explaining findings — not a report generator. "
                "Be concise, direct, and conversational. "
                "Follow summary, threatPosture, and metrics exactly — never contradict them. "
                "If threatPosture is elevated, say the posture is elevated even when openAlerts is zero. "
                "Open forensic alerts and registry threats are different: zero open alerts does not mean stable if registry threats exist. "
                "If papers are compromised, explain what that means in context. "
                "Never fabricate details not in the tool data. If something is unknown, say so. "
                "No bullet points, no markdown, no tables — just natural flowing text."
            ),
        },
        *history_messages(history),
        {
            "role": "user",
            "content": "\n".join(
                [
                    f"Investigator asked: {prompt}",
                    "",
                    "Here is the live data returned by the tool:",
                    tool_context,
                    "",
                    "Respond naturally based on this data. Answer the investigator's actual question."
                ]
            ),
        },
    ]


def history_messages(history: list[JsonObject]) -> list[JsonObject]:
    messages: list[JsonObject] = []
    for item in history[-6:]:
        role = "user" if item.get("role") == "operator" else "assistant"
        content = str(item.get("content") or "")
        if content:
            messages.append({"role": role, "content": content})
    return messages
