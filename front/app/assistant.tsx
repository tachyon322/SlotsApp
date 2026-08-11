"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  AssistantRuntimeProvider,
  AuiConfig,
  Tools,
} from "@assistant-ui/react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Thread } from "@/components/assistant-ui/thread";
import { supportToolkit } from "@/lib/support-toolkit";
import { supportApi, type SupportMessageItem } from "@/lib/api";

export type AssistantProps = {
  conversationId: string;
  initialItems?: SupportMessageItem[];
};

type ChatRuntime = ReturnType<typeof useChatRuntime>;

// How often to reconcile operator messages with the server as a fallback for
// the SSE fast path (which may be buffered by some proxies/dev servers).
const RESYNC_MS = 10_000;

function appendItem(runtime: ChatRuntime, item: SupportMessageItem) {
  runtime.thread.append({
    role: item.role === "user" ? "user" : "assistant",
    content: [{ type: "text", text: item.content }],
    metadata:
      item.role === "operator" ? { custom: { source: "operator" } } : undefined,
    createdAt: new Date(item.createdAt),
    startRun: false,
  });
}

export const Assistant = ({ conversationId, initialItems = [] }: AssistantProps) => {
  // The stable server-side conversation id is merged into every chat request
  // body so messages persist under the same conversation across sessions.
  const transport = useMemo(
    () => new AssistantChatTransport({ api: "/api/chat", body: { conversationId } }),
    [conversationId],
  );

  // "none" keeps consecutive assistant messages separate, so an operator reply
  // renders as its own message instead of being merged into the AI's response.
  const runtime = useChatRuntime({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport,
    joinStrategy: "none",
  });

  const runtimeRef = useRef<ChatRuntime>(runtime);
  runtimeRef.current = runtime;

  const appendedIds = useRef<Set<string>>(new Set());

  // Append any operator messages from the server that are not in the thread yet.
  const resync = useCallback(async () => {
    try {
      const data = await supportApi.thread();
      const seen = appendedIds.current;
      for (const item of data.items) {
        if (item.role !== "operator") continue;
        const key = item.messageId || item.id;
        if (seen.has(key)) continue;
        seen.add(key);
        appendItem(runtimeRef.current, item);
      }
    } catch {
      // Try again on the next tick.
    }
  }, []);

  // Restore the persisted conversation history into the thread once.
  useEffect(() => {
    const seen = appendedIds.current;
    for (const item of initialItems) {
      const key = item.messageId || item.id;
      if (seen.has(key)) continue;
      seen.add(key);
      appendItem(runtimeRef.current, item);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live operator replies over SSE (Redis pub/sub) plus a periodic fallback
  // resync so replies arrive even if the stream is buffered/blocked.
  useEffect(() => {
    const source = new EventSource("/api/support/stream");
    let firstOpen = true;

    const onOpen = () => {
      if (firstOpen) {
        firstOpen = false;
        return;
      }
      // Catch up on anything published while the connection was down.
      void resync();
    };

    const onMessage = (event: MessageEvent<string>) => {
      try {
        const item = JSON.parse(event.data) as SupportMessageItem;
        if (item.role !== "operator") return;
        const key = item.messageId || item.id;
        const seen = appendedIds.current;
        if (seen.has(key)) return;
        seen.add(key);
        appendItem(runtimeRef.current, item);
      } catch {
        // Ignore heartbeats and malformed events.
      }
    };
    source.addEventListener("open", onOpen);
    source.addEventListener("message", onMessage);

    const timer = setInterval(() => void resync(), RESYNC_MS);

    return () => {
      source.removeEventListener("open", onOpen);
      source.removeEventListener("message", onMessage);
      source.close();
      clearInterval(timer);
    };
  }, [resync]);

  const config = AuiConfig({ tools: Tools({ toolkit: supportToolkit }) });

  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      <div className="h-full">
        <Thread />
      </div>
    </AssistantRuntimeProvider>
  );
};
