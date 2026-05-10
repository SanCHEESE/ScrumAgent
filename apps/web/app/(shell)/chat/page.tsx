import { Suspense } from "react";
import { ChatScreen } from "@/components/screens/chat/ChatScreen";

/**
 * Ask-agent screen — streaming chat, agent action trace, tool-use confirmation,
 * and collapsible session history. Wrapped in Suspense because the screen reads
 * `?seed=…` via useSearchParams (Next.js 14 requires the boundary).
 */
export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatScreen />
    </Suspense>
  );
}
