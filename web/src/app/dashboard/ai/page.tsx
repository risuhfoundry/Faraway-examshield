"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  BrainCircuit,
  Check,
  Command,
  Copy,
  ExternalLink,
  FileSearch,
  FileText,
  Loader2,
  MessageSquare,
  Radar,
  Search,
  Send,
  ShieldAlert,
  Terminal,
  X,
  type LucideIcon,
} from "lucide-react";

type AiToolName =
  | "listEvidence"
  | "getEvidence"
  | "getAttribution"
  | "lookupPaper"
  | "listThreats"
  | "generateReport";

type AiMetric = {
  label: string;
  value: string;
};

type AiToolResult = {
  tool: AiToolName;
  title: string;
  summary: string;
  currentInvestigation: {
    evidenceId: string | null;
    paperId: string | null;
    status: string;
    confidence: number | null;
    risk: string | null;
    centerCode: string | null;
  };
  metrics: AiMetric[];
  sections: Array<{
    title: string;
    rows: AiMetric[];
  }>;
  evidenceIds: string[];
  generatedAt: string;
};

type AiStreamEvent =
  | { type: "stage"; message: string }
  | { type: "tool"; tool: AiToolName; result: AiToolResult }
  | { type: "token"; token: string }
  | { type: "meta"; model: string; provider: "nvidia-nim" | "local-fallback" }
  | { type: "error"; message: string }
  | { type: "done"; latencyMs?: number };

type ChatMessage = {
  id: string;
  role: "operator" | "assistant";
  content: string;
  stages?: string[];
  toolResult?: AiToolResult | null;
  streaming?: boolean;
  model?: string | null;
};

type SuggestedAction = {
  title: string;
  prompt: string;
  icon: LucideIcon;
};

const suggestedActions: SuggestedAction[] = [
  { title: "Investigate Evidence", prompt: "Investigate latest evidence.", icon: FileSearch },
  { title: "Show Critical Threats", prompt: "Show critical threats.", icon: ShieldAlert },
  { title: "Generate Daily Report", prompt: "Generate daily report.", icon: FileText },
  { title: "View Compromised Papers", prompt: "View compromised papers.", icon: AlertTriangle },
  { title: "Analyze Latest Upload", prompt: "Analyze latest upload.", icon: Radar },
];

const AI_SERVICE_URL = (
  process.env.NEXT_PUBLIC_EXAMSHIELD_AI_SERVICE_URL ?? "http://127.0.0.1:8790"
).replace(/\/$/, "");

export default function ExamshieldAiPage() {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [currentInvestigation, setCurrentInvestigation] = useState<AiToolResult["currentInvestigation"]>({
    evidenceId: null,
    paperId: null,
    status: "Standby",
    confidence: null,
    risk: null,
    centerCode: null,
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function fillPrompt(value: string) {
    setPrompt(value);
    window.setTimeout(() => promptRef.current?.focus(), 0);
  }

  async function sendPrompt(value = prompt) {
    const trimmed = value.trim();
    if (!trimmed || streamingId) {
      return;
    }

    const operatorMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "operator",
      content: trimmed,
    };
    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      stages: [],
      toolResult: null,
      streaming: true,
      model: null,
    };

    setMessages((existing) => [...existing, operatorMessage, assistantMessage]);
    setPrompt("");
    setStreamingId(assistantId);

    try {
      const response = await fetch(`${AI_SERVICE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmed,
          currentEvidenceId: currentInvestigation.evidenceId,
          messages: messages.slice(-6).map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("EXAMSHIELD AI stream failed.");
      }

      const smoother = createTokenSmoother((token) => {
        setMessages((existing) => applyStreamEvent(existing, assistantId, { type: "token", token }));
      });
      let doneEvent: Extract<AiStreamEvent, { type: "done" }> | null = null;

      await consumeStream(response.body, (event) => {
        if (event.type === "token") {
          smoother.enqueue(event.token);
          return;
        }
        if (event.type === "done") {
          doneEvent = event;
          return;
        }
        setMessages((existing) => applyStreamEvent(existing, assistantId, event));
        if (event.type === "tool") {
          setCurrentInvestigation(event.result.currentInvestigation);
        }
      });
      await smoother.waitForDrain();
      setMessages((existing) => applyStreamEvent(existing, assistantId, doneEvent ?? { type: "done" }));
    } catch (error) {
      setMessages((existing) =>
        existing.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content:
                  `ANALYSIS FAILED.\n\nEXAMSHIELD AI could not reach the Python service at ${AI_SERVICE_URL}.`,
                stages: [...(message.stages ?? []), error instanceof Error ? error.message : "Stream failed."],
                streaming: false,
              }
            : message,
        ),
      );
    } finally {
      setStreamingId(null);
    }
  }

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendPrompt();
    }
  }, [prompt, streamingId, messages, currentInvestigation]);

  function autoResize(textarea: HTMLTextAreaElement | null) {
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
    }
  }

  return (
    <div className="h-[calc(100vh-8rem)] min-h-[640px] flex min-w-0 flex-col">
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 pb-5">
          <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="border border-white/15 bg-white/[0.04] p-2">
                <BrainCircuit className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-heading uppercase tracking-widest text-white">
                  EXAMSHIELD AI
                </h1>
                <p className="mt-1 text-xs font-mono uppercase tracking-widest text-white/45">
                  National Examination Security AI
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="inline-flex items-center justify-center gap-2 border border-white/15 bg-white/[0.03] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/60 hover:border-white/40 hover:text-white"
            >
              <Command className="h-3.5 w-3.5" />
              Ctrl K
            </button>
          </div>
        </header>

        <section ref={chatContainerRef} className="flex-1 overflow-y-auto py-3 scroll-smooth">
          {messages.length === 0 ? (
            <SuggestedActions onSelect={fillPrompt} />
          ) : (
            <div className="mx-auto max-w-5xl space-y-5 pb-4">
              {messages.map((message, index) => (
                <ChatBubble key={message.id} message={message} isLatest={index === messages.length - 1} />
              ))}
              <div ref={chatBottomRef} />
            </div>
          )}
        </section>

        <footer className="shrink-0 pt-4">
          <div className="mx-auto flex max-w-5xl items-end gap-3 border border-white/10 bg-black p-3">
            <textarea
              ref={(el) => { promptRef.current = el; autoResize(el); }}
              value={prompt}
              onChange={(event) => { setPrompt(event.target.value); autoResize(event.target); }}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Ask anything..."
              disabled={Boolean(streamingId)}
              className="min-h-11 max-h-48 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-white outline-none placeholder:text-white/25 disabled:opacity-40"
            />
            <button
              type="button"
              onClick={() => sendPrompt()}
              disabled={!prompt.trim() || Boolean(streamingId)}
              className="flex h-11 w-11 shrink-0 items-center justify-center border border-white bg-white text-black transition-colors hover:bg-white/90 disabled:border-white/10 disabled:bg-white/10 disabled:text-white/25"
              title="Send command"
            >
              {streamingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <div className="mx-auto mt-2 max-w-5xl text-right text-[10px] uppercase tracking-widest text-white/20">
            {streamingId ? "Streaming response..." : "Ctrl+Enter for new line"}
          </div>
        </footer>
      </main>

      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onSelect={(value) => {
            fillPrompt(value);
            setPaletteOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SuggestedActions({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col justify-end pb-8">
      <div className="space-y-5">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/35">
            <Terminal className="h-3.5 w-3.5" />
            Suggested Commands
          </div>
          <p className="mt-2 text-sm text-white/45">
            Pick a command or type your own below.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {suggestedActions.map((action) => (
            <button
              key={action.title}
              type="button"
              onClick={() => onSelect(action.prompt)}
              className="group inline-flex min-h-11 items-center gap-2 border border-white/10 bg-white/[0.02] px-3 py-2 text-left transition-all hover:border-white/30 hover:bg-white/[0.06]"
            >
              <action.icon className="h-4 w-4 shrink-0 text-white/50 group-hover:text-white/80" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-white/80 group-hover:text-white">
                {action.title}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ message, isLatest }: { message: ChatMessage; isLatest?: boolean }) {
  if (message.role === "operator") {
    return (
      <div className="flex justify-end">
        <div className="max-w-2xl border border-white/15 bg-white/[0.04] px-5 py-4">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
            <div className="h-1.5 w-1.5 rounded-full bg-white/30" />
            Investigator
          </div>
          <div className="text-sm leading-relaxed text-white/90">{message.content}</div>
        </div>
      </div>
    );
  }

  const hasTool = Boolean(message.toolResult);

  if (!hasTool) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl border border-white/10 bg-white/[0.02]"
      >
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/35">
            <Bot className="h-3.5 w-3.5" />
            EXAMSHIELD AI
            {isLatest && message.streaming && (
              <span className="ml-2 inline-flex items-center gap-1.5 text-white/45">
                <span className="h-1 w-1 animate-pulse rounded-full bg-white" />
                <span className="h-1 w-1 animate-pulse rounded-full bg-white [animation-delay:150ms]" />
                <span className="h-1 w-1 animate-pulse rounded-full bg-white [animation-delay:300ms]" />
              </span>
            )}
          </div>
          {message.content && !message.streaming && (
            <CopyButton text={message.content} />
          )}
        </div>
        <div className="px-5 py-4">
          <div className="whitespace-pre-wrap font-mono text-sm leading-7 text-white/85">
            {message.content}
            {message.streaming && <span className="ml-0.5 inline-block h-4 w-[3px] animate-pulse bg-white align-middle" />}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-white/10 bg-black"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="border border-white/15 bg-white/[0.04] p-1.5">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-white">EXAMSHIELD AI</div>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/35">
              <div className="h-1 w-1 rounded-full bg-green-500/60" />
              {message.model ?? "Tool Router"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {message.content && !message.streaming && (
            <CopyButton text={message.content} />
          )}
          {message.streaming && (
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/45">
              <Loader2 className="h-3 w-3 animate-spin" />
              Streaming
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 p-5">
        {message.stages && message.stages.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.stages.slice(-3).map((stage) => (
              <div key={stage} className="flex items-center gap-1.5 border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[10px] uppercase tracking-widest text-white/45">
                <div className="h-1.5 w-1.5 rounded-full bg-blue-500/50" />
                {stage}
              </div>
            ))}
          </div>
        )}

        <ToolResultPanel result={message.toolResult!} />

        <div className="border-l-2 border-white/10 pl-4">
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/35">
            <MessageSquare className="h-3.5 w-3.5" />
            Analyst Transmission
          </div>
          <div className="whitespace-pre-wrap font-mono text-sm leading-7 text-white/85">
            {message.content}
            {message.streaming && <span className="ml-0.5 inline-block h-4 w-[3px] animate-pulse bg-white align-middle" />}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-white/30 transition-colors hover:text-white/60"
      title="Copy response"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          Copy
        </>
      )}
    </button>
  );
}

function ToolResultPanel({ result }: { result: AiToolResult }) {
  const toolActions: Record<string, { label: string; href: string }> = {
    listEvidence: { label: "View Evidence Center", href: "/dashboard/evidence" },
    getEvidence: { label: "View Evidence Center", href: "/dashboard/evidence" },
    getAttribution: { label: "Open Investigation Workspace", href: "/dashboard/investigation" },
    lookupPaper: { label: "View Registry", href: "/dashboard/threats" },
    listThreats: { label: "View Threat Intelligence", href: "/dashboard/threats" },
    generateReport: { label: "Command Center", href: "/dashboard" },
  };

  return (
    <div className="border border-white/10 bg-white/[0.025]">
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.4fr]">
        <div className="border-b border-white/10 p-5 lg:border-b-0 lg:border-r lg:border-white/10">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Tool Report</div>
          <div className="mt-3 text-3xl font-heading uppercase tracking-widest">{result.title}</div>
          <p className="mt-3 text-sm leading-6 text-white/55">{result.summary}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4">
          {result.metrics.map((metric) => (
            <div
              key={`${metric.label}-${metric.value}`}
              className="min-h-28 border-b border-r border-white/10 p-4 last:border-r-0"
            >
              <div className="text-[10px] uppercase tracking-widest text-white/35">{metric.label}</div>
              <div className="mt-4 break-words text-xl font-heading uppercase tracking-widest">
                <EvidenceLink value={metric.value} className="text-xl font-heading" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 border-t border-white/10 lg:grid-cols-2">
        {result.sections.slice(0, 4).map((section) => (
          <div key={section.title} className="border-b border-r border-white/10 p-5">
            <div className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">
              {section.title}
            </div>
            <div className="space-y-3">
              {section.rows.slice(0, 6).map((row) => (
                <div
                  key={`${section.title}-${row.label}-${row.value}`}
                  className="flex items-start justify-between gap-4 border-t border-white/10 pt-3 first:border-t-0 first:pt-0"
                >
                  <span className="text-xs uppercase tracking-widest text-white/35">{row.label}</span>
                  <EvidenceLink value={row.value} className="max-w-[60%] text-right text-sm font-semibold text-white/85" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-white/10 px-5 py-4">
        {result.evidenceIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-white/35">Linked Evidence:</span>
            {result.evidenceIds.map((id) => (
              <Link
                key={id}
                href={`/evidence/${id}`}
                className="inline-flex items-center gap-1 border border-white/15 bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/70 transition-colors hover:border-white/40 hover:text-white"
              >
                {id}
                <ExternalLink className="h-2.5 w-2.5" />
              </Link>
            ))}
          </div>
        )}
        {toolActions[result.tool] && (
          <Link
            href={toolActions[result.tool].href}
            className="ml-auto inline-flex items-center gap-1.5 border border-white/15 bg-white/[0.03] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/60 transition-colors hover:border-white/40 hover:text-white"
          >
            {toolActions[result.tool].label}
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}

function EvidenceLink({ value, className }: { value: string; className?: string }) {
  const evMatch = value.match(/\b(EV-\d+)\b/);
  if (evMatch) {
    return (
      <Link href={`/evidence/${evMatch[1]}`} className={`inline-flex items-center gap-1 text-right text-sm font-semibold text-white/85 underline decoration-white/20 hover:decoration-white/60 ${className}`}>
        {value}
        <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-50" />
      </Link>
    );
  }
  const paperMatch = value.match(/\b([A-Z]{2,5}-\d{4}-\w)\b/);
  if (paperMatch) {
    return (
      <span className={`text-right text-sm font-semibold text-white/85 ${className}`}>{value}</span>
    );
  }
  return <span className={`text-right text-sm font-semibold text-white/85 ${className}`}>{value}</span>;
}

function CommandPalette({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (prompt: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/75 px-4 pt-28 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl border border-white/20 bg-black shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-white/10 p-4">
          <Search className="h-4 w-4 text-white/45" />
          <div className="flex-1 text-xs uppercase tracking-[0.2em] text-white/45">Command Palette</div>
          <button type="button" onClick={onClose} className="text-white/45 hover:text-white" title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-2">
          {suggestedActions.map((action) => (
            <button
              key={action.title}
              type="button"
              onClick={() => onSelect(action.prompt)}
              className="flex w-full items-center gap-3 border border-transparent px-4 py-3 text-left hover:border-white/15 hover:bg-white/[0.04]"
            >
              <action.icon className="h-4 w-4 text-white/60" />
              <div>
                <div className="text-sm uppercase tracking-widest text-white">{action.title}</div>
                <div className="mt-1 text-xs text-white/35">{action.prompt}</div>
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

async function consumeStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AiStreamEvent) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) {
          continue;
        }
        const data = line.slice(5).trim();
        if (data) {
          onEvent(JSON.parse(data) as AiStreamEvent);
        }
      }
    }
  }
}

function createTokenSmoother(onToken: (token: string) => void) {
  let queued = "";
  let timer: number | null = null;
  let drainResolvers: Array<() => void> = [];

  function schedule() {
    if (timer !== null) {
      return;
    }
    timer = window.setTimeout(tick, 16);
  }

  function tick() {
    timer = null;
    if (!queued) {
      resolveDrain();
      return;
    }
    const size = queued.length > 900 ? 18 : queued.length > 420 ? 10 : 4;
    const chunk = queued.slice(0, size);
    queued = queued.slice(size);
    onToken(chunk);
    schedule();
  }

  function resolveDrain() {
    const resolvers = drainResolvers;
    drainResolvers = [];
    resolvers.forEach((resolve) => resolve());
  }

  return {
    enqueue(token: string) {
      queued += token;
      schedule();
    },
    waitForDrain() {
      if (!queued && timer === null) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        drainResolvers.push(resolve);
      });
    },
  };
}

function applyStreamEvent(messages: ChatMessage[], assistantId: string, event: AiStreamEvent) {
  return messages.map((message) => {
    if (message.id !== assistantId) {
      return message;
    }
    if (event.type === "stage") {
      return { ...message, stages: [...(message.stages ?? []), event.message] };
    }
    if (event.type === "tool") {
      return { ...message, toolResult: event.result };
    }
    if (event.type === "token") {
      return { ...message, content: `${message.content}${event.token}` };
    }
    if (event.type === "meta") {
      return { ...message, model: event.model };
    }
    if (event.type === "error") {
      return { ...message, stages: [...(message.stages ?? []), event.message] };
    }
    if (event.type === "done") {
      return { ...message, streaming: false };
    }
    return message;
  });
}