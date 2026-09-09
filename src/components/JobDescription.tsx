"use client";

import { Fragment } from "react";

// Renders the Markdown subset that htmlToMarkdown (src/lib/text-format.ts)
// produces: "## " headings, "- " bullets, **bold**, blank-line paragraphs.
//
// Deliberately a hand-rolled parser rather than dangerouslySetInnerHTML: job
// descriptions are third-party scraped content, so there is no HTML path into
// the DOM at all. Postings scraped before this existed are plain flowing text
// with no markers — they simply render as one paragraph, exactly as before.

/** Wrap **bold** runs. An unpaired "**" is left as literal text, not swallowed. */
function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold text-[#101828]">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}

type Block =
  | { kind: "heading"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "paragraph"; text: string };

function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];

  const flush = () => {
    if (bullets.length) {
      blocks.push({ kind: "list", items: bullets });
      bullets = [];
    }
    if (paragraph.length) {
      blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  };

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
    } else if (trimmed.startsWith("## ")) {
      flush();
      blocks.push({ kind: "heading", text: trimmed.slice(3).trim() });
    } else if (trimmed.startsWith("- ")) {
      // A bullet ends any paragraph, but consecutive bullets stay one list.
      if (paragraph.length) {
        blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
        paragraph = [];
      }
      bullets.push(trimmed.slice(2).trim());
    } else {
      if (bullets.length) {
        blocks.push({ kind: "list", items: bullets });
        bullets = [];
      }
      paragraph.push(trimmed);
    }
  }
  flush();
  return blocks;
}

export function JobDescription({ text }: { text: string | null }) {
  if (!text?.trim()) {
    return <p className="text-[13px] text-[#94A3B8]">No description available.</p>;
  }

  return (
    <div className="space-y-3 text-[13px] leading-relaxed text-[#1E2A3D]">
      {toBlocks(text).map((block, i) => {
        if (block.kind === "heading") {
          return (
            <h4
              key={i}
              className="pt-2 text-[13px] font-semibold tracking-wide text-[#101828] first:pt-0"
            >
              {renderInline(block.text)}
            </h4>
          );
        }
        if (block.kind === "list") {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 marker:text-[#94A3B8]">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}
