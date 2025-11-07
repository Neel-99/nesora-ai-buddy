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
        <div className="flex-shrink-0 w-10 h-10 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-brand">
          <Bot className="w-6 h-6 text-primary-foreground" />
        </div>
      )}
      
      <div
        className={cn(
          "max-w-[80%] md:max-w-[70%] rounded-2xl px-5 py-4 shadow-soft transition-all",
          isUser
            ? "bg-gradient-primary text-primary-foreground rounded-tr-none"
            : "bg-card/80 backdrop-blur-sm border border-border/50 rounded-tl-none hover:border-border"
        )}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium">{content}</p>
        ) : (
          <MarkdownMessage content={content} className="text-sm text-foreground" />
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-10 h-10 rounded-2xl bg-muted/50 border border-border flex items-center justify-center shadow-soft">
          <User className="w-6 h-6 text-muted-foreground" />
        </div>
      )}
    </div>
  );
};

export default ChatMessage;
