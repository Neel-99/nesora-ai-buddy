import { Bot } from "lucide-react";

const TypingIndicator = () => {
  return (
    <div className="flex gap-3 animate-fade-in">
      <div className="flex-shrink-0 w-10 h-10 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-brand">
        <Bot className="w-6 h-6 text-primary-foreground animate-pulse" />
      </div>
      
      <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl rounded-tl-none px-5 py-4 shadow-soft">
        <div className="flex gap-1.5 items-center">
          <span className="text-xs text-muted-foreground mr-2">Thinking</span>
          <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.3s]"></div>
          <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.15s]"></div>
          <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce"></div>
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;
