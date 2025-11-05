import { Bot } from "lucide-react";

const TypingIndicator = () => {
  return (
    <div className="flex gap-3 animate-fade-in">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-soft">
        <Bot className="w-5 h-5 text-primary-foreground" />
      </div>
      
      <div className="bg-card border border-border rounded-2xl rounded-tl-none px-4 py-3 shadow-soft">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse-glow" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse-glow" style={{ animationDelay: "200ms" }} />
          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse-glow" style={{ animationDelay: "400ms" }} />
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;
