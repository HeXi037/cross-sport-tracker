"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ShareParticipant = {
  label: string;
  players: string[];
};

type ShareSummaryColumn = {
  key: string;
  label: string;
};

type ShareSummaryRow = {
  label: string;
  values: Record<string, number | null>;
};

type ShareMatchButtonProps = {
  matchId: string;
  matchTitle: string;
  sharePath: string;
  participants: ShareParticipant[];
  summaryColumns: ShareSummaryColumn[];
  summaryRows: ShareSummaryRow[];
  meta: string[];
  status?: string | null;
  playedAt?: string | null;
  location?: string | null;
};

function escapeCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export default function ShareMatchButton({
  matchId,
  matchTitle,
  sharePath,
  participants,
  summaryColumns,
  summaryRows,
  meta,
  status,
  playedAt,
  location,
}: ShareMatchButtonProps) {
  const [shareUrl, setShareUrl] = useState<string>(sharePath);
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setShareUrl(window.location.href);
  }, [sharePath]);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current) return;
      if (event.target instanceof Node && !containerRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!feedback) return undefined;
    const timeout = window.setTimeout(() => {
      setFeedback(null);
    }, 4000);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [feedback]);

  const matchMetaLines = useMemo(() => {
    const lines: string[] = [];
    if (status) lines.push(`Status: ${status}`);
    if (playedAt) lines.push(`Date & time: ${playedAt}`);
    if (location) lines.push(`Location: ${location}`);
    meta.forEach((entry) => {
      if (!lines.includes(entry)) {
        lines.push(entry);
      }
    });
    return lines;
  }, [status, playedAt, location, meta]);

  const handleCopyLink = useCallback(async () => {
    const url = shareUrl || sharePath;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setFeedback("Match link copied to clipboard");
    } catch (error) {
      console.error("Unable to copy match link", error);
      setFeedback("Unable to copy match link. Try copying the URL manually.");
    } finally {
      setMenuOpen(false);
    }
  }, [shareUrl, sharePath]);

  const buildCsvContent = useCallback(() => {
    const lines: string[] = [];
    lines.push(`Match,${escapeCsvValue(matchTitle)}`);
    matchMetaLines.forEach((line) => {
      const [label, ...rest] = line.split(": ");
      if (label && rest.length) {
        lines.push(`${escapeCsvValue(label)},${escapeCsvValue(rest.join(": "))}`);
      } else {
        lines.push(`Detail,${escapeCsvValue(line)}`);
      }
    });

    if (participants.length) {
      lines.push("");
      lines.push(["Side", "Players"].map(escapeCsvValue).join(","));
      participants.forEach((participant) => {
        lines.push(
          [
            escapeCsvValue(participant.label),
            escapeCsvValue(participant.players.join(" / ")),
          ].join(",")
        );
      });
    }

    if (summaryColumns.length && summaryRows.length) {
      lines.push("");
      lines.push(
        ["Side", ...summaryColumns.map((column) => column.label)].map(escapeCsvValue).join(",")
      );
      summaryRows.forEach((row) => {
        const rowValues = summaryColumns.map((column) =>
          escapeCsvValue(row.values[column.key] ?? "")
        );
        lines.push([escapeCsvValue(row.label), ...rowValues].join(","));
      });
    }

    return `${lines.join("\n")}\n`;
  }, [matchTitle, matchMetaLines, participants, summaryColumns, summaryRows]);

  const handleDownloadCsv = useCallback(() => {
    try {
      const csvContent = buildCsvContent();
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `match-${matchId}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setFeedback("CSV exported successfully");
    } catch (error) {
      console.error("Unable to export match CSV", error);
      setFeedback("Unable to export CSV. Please try again.");
    } finally {
      setMenuOpen(false);
    }
  }, [buildCsvContent, matchId]);

  const handleDownloadPdf = useCallback(async () => {
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      let cursorY = 14;
      const lineHeight = 6;
      const maxWidth = 190;

      const ensureSpace = (extra: number) => {
        if (cursorY + extra > 285) {
          doc.addPage();
          cursorY = 14;
        }
      };

      const writeLines = (text: string, indent = 0) => {
        const availableWidth = maxWidth - indent;
        const lines = doc.splitTextToSize(text, availableWidth);
        lines.forEach((line) => {
          ensureSpace(lineHeight);
          doc.text(line, 10 + indent, cursorY);
          cursorY += lineHeight;
        });
      };

      doc.setFontSize(16);
      writeLines(matchTitle);
      cursorY += 2;

      doc.setFontSize(12);
      matchMetaLines.forEach((line) => writeLines(line));
      if (matchMetaLines.length) {
        cursorY += 4;
      }

      if (participants.length) {
        doc.setFontSize(14);
        writeLines("Participants");
        doc.setFontSize(12);
        participants.forEach((participant) => {
          writeLines(`${participant.label}: ${participant.players.join(" & ")}`, 4);
        });
        cursorY += 2;
      }

      if (summaryColumns.length && summaryRows.length) {
        doc.setFontSize(14);
        writeLines("Results");
        doc.setFontSize(12);
        summaryRows.forEach((row) => {
          const parts = summaryColumns.map((column) => {
            const value = row.values[column.key];
            return `${column.label}: ${value ?? "—"}`;
          });
          writeLines(`${row.label} – ${parts.join(", ")}`, 4);
        });
      }

      doc.save(`match-${matchId}.pdf`);
      setFeedback("PDF exported successfully");
    } catch (error) {
      console.error("Unable to export match PDF", error);
      setFeedback("Unable to export PDF. Please try again.");
    } finally {
      setMenuOpen(false);
    }
  }, [matchId, matchMetaLines, matchTitle, participants, summaryColumns, summaryRows]);

  return (
    <div className="share-match" ref={containerRef}>
      <button
        type="button"
        className="button-secondary share-match__trigger"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        Share match
      </button>
      {menuOpen ? (
        <div className="share-match__menu" role="menu">
          <button
            type="button"
            className="share-match__menu-item"
            role="menuitem"
            onClick={handleCopyLink}
          >
            Copy link
          </button>
          <button
            type="button"
            className="share-match__menu-item"
            role="menuitem"
            onClick={handleDownloadPdf}
          >
            Export PDF
          </button>
          <button
            type="button"
            className="share-match__menu-item"
            role="menuitem"
            onClick={handleDownloadCsv}
          >
            Export CSV
          </button>
        </div>
      ) : null}
      <p className="share-match__feedback" role="status" aria-live="polite">
        {feedback}
      </p>
    </div>
  );
}
