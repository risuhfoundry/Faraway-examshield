from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable

from .store import EvidenceStore, JsonObject, is_today


ToolHandler = Callable[[JsonObject], "ToolExecution"]


@dataclass(frozen=True)
class ToolExecution:
    result: JsonObject
    model_context: str


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: JsonObject
    handler: ToolHandler

    def schema(self) -> JsonObject:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


class ExamshieldToolRegistry:
    def __init__(self, store: EvidenceStore) -> None:
        self.store = store
        self._tools = {
            "listEvidence": ToolSpec(
                name="listEvidence",
                description="List live EXAMSHIELD evidence records for recent uploads, today's uploads, or the investigation queue.",
                parameters=schema(
                    {
                        "filter": {
                            "type": "string",
                            "enum": ["recent", "today"],
                            "description": "Use today only when the user asks for evidence uploaded today.",
                        }
                    }
                ),
                handler=self._list_evidence,
            ),
            "getEvidence": ToolSpec(
                name="getEvidence",
                description="Get one evidence record with filename, source, OCR status, confidence, and upload time.",
                parameters=schema(
                    {
                        "evidenceId": {
                            "type": "string",
                            "description": "The EXAMSHIELD evidence ID, for example EV-001.",
                        }
                    },
                    required=("evidenceId",),
                ),
                handler=self._get_evidence,
            ),
            "getAttribution": ToolSpec(
                name="getAttribution",
                description="Get forensic attribution for evidence, including paper match, center, printer, batch, confidence, and risk.",
                parameters=schema(
                    {
                        "evidenceId": {
                            "type": "string",
                            "description": "The EXAMSHIELD evidence ID, for example EV-001.",
                        }
                    },
                    required=("evidenceId",),
                ),
                handler=self._get_attribution,
            ),
            "lookupPaper": ToolSpec(
                name="lookupPaper",
                description="Look up a paper in the EXAMSHIELD core registry by paper ID.",
                parameters=schema(
                    {
                        "paperId": {
                            "type": "string",
                            "description": "The registry paper ID, for example NEET-2026-A.",
                        }
                    },
                    required=("paperId",),
                ),
                handler=self._lookup_paper,
            ),
            "listThreats": ToolSpec(
                name="listThreats",
                description="List active alerts, threats, critical leaks, risks, or compromised papers.",
                parameters=schema(
                    {
                        "variant": {
                            "type": "string",
                            "enum": ["compromised"],
                            "description": "Use compromised when the user asks for compromised papers.",
                        }
                    }
                ),
                handler=self._list_threats,
            ),
            "generateReport": ToolSpec(
                name="generateReport",
                description="Generate a live EXAMSHIELD daily report, command briefing, executive report, or operational summary.",
                parameters=schema({}),
                handler=self._generate_report,
            ),
        }

    def schemas(self) -> list[JsonObject]:
        return [tool.schema() for tool in self._tools.values()]

    def names(self) -> list[str]:
        return sorted(self._tools)

    def execute(self, name: str, arguments: JsonObject | None = None) -> ToolExecution:
        tool = self._tools.get(name)
        if not tool:
            result = create_result(
                tool="listEvidence",
                title="TOOL NOT FOUND",
                summary=f"{name} is not registered in the EXAMSHIELD AI service.",
                current_investigation=empty_investigation(),
                metrics=[metric("Available Tools", ", ".join(self.names()))],
                sections=[],
                evidence_ids=[],
            )
            return with_context(result)
        return tool.handler(arguments or {})

    def planner_context(self, current_evidence_id: str | None = None) -> JsonObject:
        data = self.store.list_evidence()
        return {
            "currentEvidenceId": current_evidence_id,
            "recentEvidence": [
                {
                    "evidenceId": item.get("evidenceId"),
                    "filename": item.get("filename"),
                    "status": item.get("status"),
                    "ocrStatus": item.get("ocrStatus"),
                    "uploadedAt": item.get("uploadedAt"),
                }
                for item in data["evidence"][:8]
            ],
            "openAlerts": [
                {
                    "alertId": item.get("alertId"),
                    "evidenceId": item.get("evidenceId"),
                    "paperId": item.get("paperId"),
                    "centerCode": item.get("centerCode"),
                    "risk": item.get("risk"),
                }
                for item in data["alerts"]
                if item.get("status") == "open"
            ][:5],
        }

    def _list_evidence(self, arguments: JsonObject) -> ToolExecution:
        filter_value = "today" if arguments.get("filter") == "today" else "recent"
        data = self.store.list_evidence()
        scoped = [item for item in data["evidence"] if is_today(item.get("uploadedAt"))] if filter_value == "today" else data["evidence"]
        latest = scoped[:5]
        critical_alerts = len([item for item in data["alerts"] if item.get("risk") == "critical"])
        result = create_result(
            tool="listEvidence",
            title="TODAY'S EVIDENCE" if latest and filter_value == "today" else "RECENT EVIDENCE" if latest else "NO EVIDENCE RECEIVED",
            summary=(
                f"{len(latest)} evidence {'item' if len(latest) == 1 else 'items'} found"
                + (" today." if filter_value == "today" else ".")
                if latest
                else ("No evidence was uploaded today." if filter_value == "today" else "Waiting for examination intelligence.")
            ),
            current_investigation=current_investigation(data),
            metrics=[
                metric("Found Today" if filter_value == "today" else "Total Evidence", len(scoped)),
                metric("Pending Analysis", data["stats"]["pendingAnalysis"]),
                metric("Completed", data["stats"]["completed"]),
                metric("Critical Alerts", critical_alerts),
            ],
            sections=[
                {
                    "title": "Latest Evidence",
                    "rows": [
                        metric(
                            item.get("evidenceId"),
                            f"{item.get('filename')} / {format_status(item.get('status'))} / OCR {format_status(item.get('ocrStatus'))} / {format_date_time(item.get('uploadedAt'))}",
                        )
                        for item in latest
                    ]
                    or [metric("Status", "No evidence received.")],
                }
            ],
            evidence_ids=[item.get("evidenceId") for item in latest if item.get("evidenceId")],
        )
        return with_context(result)

    def _get_evidence(self, arguments: JsonObject) -> ToolExecution:
        evidence_id = str(arguments.get("evidenceId") or "").strip()
        bundle = self.store.get_bundle(evidence_id)
        if not bundle:
            result = create_result(
                tool="getEvidence",
                title="EVIDENCE NOT FOUND",
                summary=f"{evidence_id or 'Requested evidence'} is not present in the evidence store.",
                current_investigation=empty_investigation(),
                metrics=[metric("Evidence", evidence_id), metric("Status", "Not Found")],
                sections=[{"title": "Recovery", "rows": [metric("Action", "Check the evidence queue and retry.")]}],
                evidence_ids=[],
            )
            return with_context(result)

        evidence = bundle["evidence"]
        result = create_result(
            tool="getEvidence",
            title="EVIDENCE FOUND",
            summary=f"{evidence.get('evidenceId')} is stored and ready for operational review.",
            current_investigation=current_investigation_from_bundle(bundle),
            metrics=evidence_metrics(bundle),
            sections=[
                {
                    "title": "Evidence",
                    "rows": [
                        metric("Filename", evidence.get("filename")),
                        metric("Source", format_source(evidence.get("source"))),
                        metric("Status", format_status(evidence.get("status"))),
                        metric("OCR", format_status(evidence.get("ocrStatus"))),
                        metric("OCR Confidence", format_percent(evidence.get("ocrConfidence"))),
                        metric("Uploaded", format_date_time(evidence.get("uploadedAt"))),
                    ],
                },
                timeline_section(bundle),
            ],
            evidence_ids=[evidence.get("evidenceId")],
        )
        return with_context(result)

    def _get_attribution(self, arguments: JsonObject) -> ToolExecution:
        evidence_id = str(arguments.get("evidenceId") or "").strip()
        bundle = self.store.get_bundle(evidence_id)
        if not bundle:
            return self._get_evidence({"evidenceId": evidence_id})

        evidence = bundle["evidence"]
        report = bundle.get("forensicReport") or {}
        attribution = bundle.get("attribution") or {}
        watermark = bundle.get("watermark") or {}
        if report.get("status") == "investigation-complete":
            title = "MATCH FOUND"
        elif evidence.get("ocrStatus") == "failed":
            title = "ANALYSIS FAILED"
        else:
            title = "ANALYSIS PENDING"

        result = create_result(
            tool="getAttribution",
            title=title,
            summary=attribution_summary(bundle),
            current_investigation=current_investigation_from_bundle(bundle),
            metrics=[
                metric("Evidence", evidence.get("evidenceId")),
                metric("Paper", report.get("paperIdentified") or attribution.get("matchedPaperId") or "Pending"),
                metric("Confidence", format_percent(report.get("finalConfidence") or attribution.get("finalConfidence"))),
                metric("Risk", format_status(report.get("riskLevel") or attribution.get("status") or "unknown")),
            ],
            sections=[
                {
                    "title": "Executive Summary",
                    "rows": [
                        metric("Evidence", f"{evidence.get('evidenceId')} / {evidence.get('filename')}"),
                        metric("Paper", report.get("paperIdentified") or attribution.get("matchedPaperId") or "Pending"),
                        metric("Watermark", watermark.get("watermarkId") or report.get("watermarkId") or "Pending"),
                        metric("Status", format_status(report.get("status") or evidence.get("status"))),
                    ],
                },
                {
                    "title": "Source Attribution",
                    "rows": [
                        metric("Center", report.get("centerCode") or attribution.get("centerCode") or "Pending"),
                        metric("Printer", report.get("printerId") or attribution.get("printerId") or "Pending"),
                        metric("Batch", report.get("batchId") or attribution.get("batchId") or "Pending"),
                        metric("Center Name", attribution.get("centerName") or "Pending"),
                    ],
                },
                {
                    "title": "Confidence",
                    "rows": [
                        metric("OCR", format_percent(report.get("ocrConfidence") or attribution.get("ocrConfidence") or evidence.get("ocrConfidence"))),
                        metric("Watermark", format_percent(report.get("watermarkConfidence") or attribution.get("watermarkConfidence") or watermark.get("confidence"))),
                        metric("Final", format_percent(report.get("finalConfidence") or attribution.get("finalConfidence"))),
                    ],
                },
                timeline_section(bundle),
            ],
            evidence_ids=[evidence.get("evidenceId")],
        )
        return with_context(result)

    def _lookup_paper(self, arguments: JsonObject) -> ToolExecution:
        paper_id = str(arguments.get("paperId") or "").strip()
        registry = self.store.read_registry()
        matches = [item for item in registry if str(item.get("paperId") or "").upper() == paper_id.upper()]
        critical = len([item for item in matches if item.get("riskLevel") == "critical"])
        compromised = [
            item for item in matches if item.get("status") in {"compromised", "investigating"}
        ]
        primary = (compromised or matches or [None])[0]
        result = create_result(
            tool="lookupPaper",
            title="PAPER LOCATED" if primary else "PAPER NOT FOUND",
            summary=(
                f"{paper_id} exists in the registry across {len(matches)} distribution records."
                if primary
                else f"{paper_id} is not registered in the current core registry seed."
            ),
            current_investigation={
                "evidenceId": None,
                "paperId": primary.get("paperId") if primary else paper_id,
                "status": format_status(primary.get("status")) if primary else "Not Found",
                "confidence": 100 if primary else None,
                "risk": primary.get("riskLevel") if primary else None,
                "centerCode": primary.get("centerCode") if primary else None,
            },
            metrics=[
                metric("Paper", paper_id),
                metric("Registry Records", len(matches)),
                metric("Critical", critical),
                metric("Compromised", len(compromised)),
            ],
            sections=[
                {
                    "title": "Top Registry Matches",
                    "rows": [
                        metric(
                            record.get("watermarkId"),
                            f"{record.get('centerCode')} / {record.get('printerId')} / {record.get('printBatch')} / {format_status(record.get('riskLevel'))}",
                        )
                        for record in matches[:6]
                    ]
                    or [metric("Result", "No paper registry record found.")],
                }
            ],
            evidence_ids=[],
        )
        return with_context(result)

    def _list_threats(self, arguments: JsonObject) -> ToolExecution:
        data = self.store.list_evidence()
        registry = self.store.read_registry()
        registry_threats = [
            item
            for item in registry
            if item.get("status") in {"compromised", "investigating"}
            or item.get("riskLevel") in {"critical", "high"}
        ]
        top_threats = (
            [item for item in registry_threats if item.get("status") == "compromised"]
            if arguments.get("variant") == "compromised"
            else registry_threats
        )
        active_alerts = [item for item in data["alerts"] if item.get("status") == "open"]
        critical_registry = len([item for item in registry_threats if item.get("riskLevel") == "critical"])
        medium_registry = len([item for item in registry_threats if item.get("riskLevel") == "medium"])
        compromised_papers = [item for item in top_threats if item.get("status") == "compromised"]
        investigating_papers = [item for item in top_threats if item.get("status") == "investigating"]
        posture, summary = threat_posture_summary(
            active_alerts=active_alerts,
            registry_threats=registry_threats,
            compromised_papers=compromised_papers,
            investigating_papers=investigating_papers,
        )
        result = create_result(
            tool="listThreats",
            title="ACTIVE THREATS" if posture == "elevated" else "NO ACTIVE THREATS",
            summary=summary,
            current_investigation=current_investigation(data),
            metrics=[
                metric("Open Alerts", len(active_alerts)),
                metric("Registry Threats", len(top_threats)),
                metric("Compromised Papers", len(compromised_papers)),
                metric("Critical Registry", critical_registry),
                metric("Medium Registry", medium_registry),
            ],
            sections=[
                {
                    "title": "Critical Alerts",
                    "rows": [alert_row(item) for item in active_alerts[:5]]
                    or [metric("Status", "No active alerts.")],
                },
                {
                    "title": "Compromised Papers",
                    "rows": [
                        metric(
                            record.get("paperId"),
                            f"{record.get('watermarkId')} / {record.get('centerCode')} / {format_status(record.get('riskLevel'))} / {format_status(record.get('status'))}",
                        )
                        for record in top_threats[:6]
                    ],
                },
            ],
            evidence_ids=[item.get("evidenceId") for item in active_alerts if item.get("evidenceId")],
        )
        result["threatPosture"] = posture
        result["openAlerts"] = len(active_alerts)
        result["registryThreatCount"] = len(registry_threats)
        result["compromisedPaperCount"] = len(compromised_papers)
        return with_context(result)

    def _generate_report(self, arguments: JsonObject) -> ToolExecution:
        data = self.store.list_evidence()
        registry = self.store.read_registry()
        active_alerts = [item for item in data["alerts"] if item.get("status") == "open"]
        running = [
            item
            for item in data["evidence"]
            if item.get("status") == "analyzing" or item.get("ocrStatus") in {"processing", "queued"}
        ]
        confirmed = [
            item
            for item in data["forensicReports"]
            if item.get("status") == "investigation-complete" and float(item.get("finalConfidence") or 0) > 80
        ]
        latest_report = confirmed[0] if confirmed else None
        registry_critical = len([item for item in registry if item.get("riskLevel") == "critical"])
        result = create_result(
            tool="generateReport",
            title="NATIONAL SECURITY BRIEFING" if active_alerts else "SECURITY BRIEFING",
            summary=(
                f"{len(active_alerts)} open critical alert{'s' if len(active_alerts) != 1 else ''} require command review."
                if active_alerts
                else "No active alerts. Evidence systems are standing by."
            ),
            current_investigation=current_investigation(data),
            metrics=[
                metric("Evidence", data["stats"]["totalEvidence"]),
                metric("Running", len(running)),
                metric("Confirmed Leaks", len(confirmed)),
                metric("Open Alerts", len(active_alerts)),
            ],
            sections=[
                {
                    "title": "Operational Posture",
                    "rows": [
                        metric("Threat Level", "Critical" if active_alerts else "Stable"),
                        metric("Registry Critical Papers", registry_critical),
                        metric("Telegram Events", len(data["telegramEvents"])),
                        metric("Completed Investigations", data["stats"]["completed"]),
                    ],
                },
                {
                    "title": "Latest Confirmed Leak",
                    "rows": [
                        metric("Evidence", latest_report.get("evidenceId")),
                        metric("Paper", latest_report.get("paperIdentified") or "Unknown"),
                        metric("Center", latest_report.get("centerCode") or "Unknown"),
                        metric("Confidence", f"{latest_report.get('finalConfidence')}%"),
                    ]
                    if latest_report
                    else [metric("Status", "No confirmed leak reports.")],
                },
                {
                    "title": "Recommended Action",
                    "rows": [
                        metric(
                            "Command",
                            "Lock affected paper, isolate source center, notify examination command."
                            if active_alerts
                            else "Maintain monitoring and keep Telegram intake online.",
                        )
                    ],
                },
            ],
            evidence_ids=[item.get("evidenceId") for item in data["evidence"][:3] if item.get("evidenceId")],
        )
        return with_context(result)


def schema(properties: JsonObject, required: tuple[str, ...] = ()) -> JsonObject:
    return {
        "type": "object",
        "properties": properties,
        "required": list(required),
        "additionalProperties": False,
    }


def create_result(
    *,
    tool: str,
    title: str,
    summary: str,
    current_investigation: JsonObject,
    metrics: list[JsonObject],
    sections: list[JsonObject],
    evidence_ids: list[str | None],
) -> JsonObject:
    return {
        "tool": tool,
        "title": title,
        "summary": summary,
        "currentInvestigation": current_investigation,
        "metrics": metrics,
        "sections": sections,
        "evidenceIds": [item for item in evidence_ids if item],
        "generatedAt": datetime.utcnow().isoformat(timespec="milliseconds") + "Z",
    }


def with_context(result: JsonObject) -> ToolExecution:
    return ToolExecution(
        result=result,
        model_context=answer_context(result),
    )


def threat_posture_summary(
    *,
    active_alerts: list[JsonObject],
    registry_threats: list[JsonObject],
    compromised_papers: list[JsonObject],
    investigating_papers: list[JsonObject],
) -> tuple[str, str]:
    if active_alerts:
        alert_text = (
            f"{len(active_alerts)} open forensic alert is active."
            if len(active_alerts) == 1
            else f"{len(active_alerts)} open forensic alerts are active."
        )
        if registry_threats:
            return (
                "elevated",
                f"{alert_text} Registry also shows {len(registry_threats)} tracked threat(s), "
                f"including {len(compromised_papers)} compromised paper(s).",
            )
        return ("elevated", alert_text)

    if registry_threats:
        paper_ids = sorted(
            {
                str(item.get("paperId"))
                for item in compromised_papers + investigating_papers
                if item.get("paperId")
            }
        )
        paper_hint = f" Papers: {', '.join(paper_ids[:6])}." if paper_ids else ""
        return (
            "elevated",
            "No open forensic alerts, but the registry shows "
            f"{len(registry_threats)} active threat(s): "
            f"{len(compromised_papers)} compromised and "
            f"{len(investigating_papers)} under investigation."
            f"{paper_hint}",
        )

    return ("stable", "No open alerts and no registry threats. National threat level stable.")


def answer_context(result: JsonObject) -> str:
    metrics = {
        str(item.get("label")): str(item.get("value"))
        for item in result.get("metrics", [])
        if item.get("label") is not None
    }
    sections = []
    for section in result.get("sections", []):
        sections.append(
            {
                "title": section.get("title"),
                "rowsAreSamplesNotTotals": True,
                "rows": section.get("rows", []),
            }
        )
    answer_rules = [
        "Use metrics for all totals and counts.",
        "Do not count section rows to create totals.",
        "Do not change a row severity; copy only the severity shown in that row.",
        "If metrics conflict with a section row count, metrics win.",
        "Do not discuss these answer rules in the reply.",
    ]
    if result.get("tool") == "listThreats":
        answer_rules.extend(
            [
                "Open forensic alerts and registry threats are different signals.",
                "If threatPosture is elevated, do not say the threat level is stable.",
                "If openAlerts is 0 but registryThreatCount is above 0, explain that forensic alerts are clear while registry threats remain active.",
                "Lead with summary and threatPosture, then mention compromised papers from sections.",
            ]
        )
    context = {
        "tool": result.get("tool"),
        "title": result.get("title"),
        "summary": result.get("summary"),
        "threatPosture": result.get("threatPosture"),
        "openAlerts": result.get("openAlerts"),
        "registryThreatCount": result.get("registryThreatCount"),
        "compromisedPaperCount": result.get("compromisedPaperCount"),
        "metrics": metrics,
        "metricsToMention": [
            {"label": label, "value": value}
            for label, value in metrics.items()
        ],
        "currentInvestigation": result.get("currentInvestigation"),
        "sections": sections,
        "evidenceIds": result.get("evidenceIds", []),
        "generatedAt": result.get("generatedAt"),
        "answerRules": answer_rules,
    }
    return json.dumps(context, indent=2, ensure_ascii=False)[:7000]


def current_investigation(data: JsonObject) -> JsonObject:
    latest_report = (data["forensicReports"] or [None])[0] or {}
    latest_attribution = (data["attributions"] or [None])[0] or {}
    latest_evidence = (data["evidence"] or [None])[0] or {}
    if not latest_evidence:
        return empty_investigation()
    return {
        "evidenceId": latest_evidence.get("evidenceId"),
        "paperId": latest_report.get("paperIdentified") or latest_attribution.get("matchedPaperId"),
        "status": format_status(latest_evidence.get("status")),
        "confidence": latest_report.get("finalConfidence")
        or latest_attribution.get("finalConfidence")
        or latest_evidence.get("ocrConfidence"),
        "risk": latest_report.get("riskLevel") or latest_attribution.get("status") or latest_evidence.get("riskLevel"),
        "centerCode": latest_report.get("centerCode") or latest_attribution.get("centerCode"),
    }


def current_investigation_from_bundle(bundle: JsonObject) -> JsonObject:
    evidence = bundle["evidence"]
    report = bundle.get("forensicReport") or {}
    attribution = bundle.get("attribution") or {}
    return {
        "evidenceId": evidence.get("evidenceId"),
        "paperId": report.get("paperIdentified") or attribution.get("matchedPaperId"),
        "status": format_status(report.get("status") or evidence.get("status")),
        "confidence": report.get("finalConfidence") or attribution.get("finalConfidence") or evidence.get("ocrConfidence"),
        "risk": report.get("riskLevel") or attribution.get("status") or evidence.get("riskLevel"),
        "centerCode": report.get("centerCode") or attribution.get("centerCode"),
    }


def empty_investigation() -> JsonObject:
    return {
        "evidenceId": None,
        "paperId": None,
        "status": "Standby",
        "confidence": None,
        "risk": None,
        "centerCode": None,
    }


def evidence_metrics(bundle: JsonObject) -> list[JsonObject]:
    evidence = bundle["evidence"]
    return [
        metric("Evidence", evidence.get("evidenceId")),
        metric("Status", format_status(evidence.get("status"))),
        metric("OCR", format_status(evidence.get("ocrStatus"))),
        metric("Confidence", format_percent(evidence.get("ocrConfidence"))),
    ]


def attribution_summary(bundle: JsonObject) -> str:
    evidence = bundle["evidence"]
    report = bundle.get("forensicReport") or {}
    attribution = bundle.get("attribution") or {}
    if report.get("status") == "investigation-complete":
        return (
            f"Investigation complete. {evidence.get('evidenceId')} matched "
            f"{report.get('paperIdentified') or 'a registered paper'} at {report.get('finalConfidence')}% confidence."
        )
    if evidence.get("ocrStatus") == "failed":
        return "Analysis failed. Retry analysis from the Investigation Workspace."
    if attribution.get("status") == "no-match":
        return "OCR completed, but no registry match was identified."
    return "Evidence has not completed forensic attribution yet."


def timeline_section(bundle: JsonObject) -> JsonObject:
    return {
        "title": "Timeline",
        "rows": [
            metric(event.get("title"), event.get("detail") or format_date_time(event.get("timestamp")))
            for event in bundle.get("activity", [])[:6]
        ],
    }


def alert_row(alert: JsonObject) -> JsonObject:
    return metric(
        alert.get("alertId"),
        f"{alert.get('paperId') or 'Unknown paper'} / {alert.get('centerCode') or 'Unknown center'} / {alert.get('confidence')}%",
    )


def metric(label: Any, value: Any) -> JsonObject:
    return {
        "label": str(label or "Pending"),
        "value": "Pending" if value in (None, "") else str(value),
    }


def format_percent(value: Any) -> str:
    return "Pending" if value in (None, "") else f"{value}%"


def format_status(value: Any) -> str:
    text = str(value or "Unknown").replace("-", " ").replace("_", " ")
    return " ".join(part.capitalize() for part in text.split())


def format_source(value: Any) -> str:
    return "Manual Upload" if value == "manual-upload" else "Telegram"


def format_date_time(value: Any) -> str:
    if not value:
        return "Pending"
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return str(value)
    return parsed.strftime("%d %b %Y, %I:%M %p")
