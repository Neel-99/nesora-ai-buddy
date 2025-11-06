import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

const MarkdownMessage = ({ content, className }: MarkdownMessageProps) => {
  return (
    <div className={cn("prose prose-sm max-w-none", className)}>
      <ReactMarkdown
        components={{
        // Style headings
        h1: ({ node, ...props }) => (
          <h1 className="text-lg font-bold mt-4 mb-2" {...props} />
        ),
        h2: ({ node, ...props }) => (
          <h2 className="text-base font-bold mt-3 mb-2" {...props} />
        ),
        h3: ({ node, ...props }) => (
          <h3 className="text-sm font-bold mt-2 mb-1" {...props} />
        ),
        // Style lists
        ul: ({ node, ...props }) => (
          <ul className="list-disc list-inside my-2 space-y-1" {...props} />
        ),
        ol: ({ node, ...props }) => (
          <ol className="list-decimal list-inside my-2 space-y-1" {...props} />
        ),
        // Style code blocks
        code: ({ node, inline, ...props }: any) => {
          if (inline) {
            return (
              <code
                className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono"
                {...props}
              />
            );
          }
          return (
            <code
              className="block bg-muted p-3 rounded-lg text-xs font-mono overflow-x-auto my-2"
              {...props}
            />
          );
        },
        // Style links
        a: ({ node, ...props }) => (
          <a
            className="text-primary underline hover:text-primary/80"
            target="_blank"
            rel="noopener noreferrer"
            {...props}
          />
        ),
        // Style tables
        table: ({ node, ...props }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full border-collapse border border-border" {...props} />
          </div>
        ),
        th: ({ node, ...props }) => (
          <th className="border border-border bg-muted px-3 py-2 text-left font-semibold text-xs" {...props} />
        ),
        td: ({ node, ...props }) => (
          <td className="border border-border px-3 py-2 text-xs" {...props} />
        ),
        // Style paragraphs
        p: ({ node, ...props }) => (
          <p className="my-2 leading-relaxed" {...props} />
        ),
        // Style blockquotes
        blockquote: ({ node, ...props }) => (
          <blockquote className="border-l-4 border-primary pl-4 italic my-2 text-muted-foreground" {...props} />
        ),
      }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownMessage;
