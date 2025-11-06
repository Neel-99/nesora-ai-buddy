import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";
import MarkdownMessage from "./MarkdownMessage";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
}

const ChatMessage = ({ role, content }: ChatMessageProps) => {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "flex gap-3 animate-fade-in",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-soft">
          <Bot className="w-5 h-5 text-primary-foreground" />
        </div>
      )}
      
      <div
        className={cn(
          "max-w-[80%] md:max-w-[70%] rounded-2xl px-4 py-3 shadow-soft",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-none"
            : "bg-card border border-border rounded-tl-none"
        )}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
        ) : (
          <MarkdownMessage content={content} className="text-sm text-foreground" />
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center shadow-soft">
          <User className="w-5 h-5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
};

export default ChatMessage;
