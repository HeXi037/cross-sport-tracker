"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildPrefilledShareLinks,
  buildShareSummaryPayload,
  type ShareParticipant,
  type ShareSummaryColumn,
  type ShareSummaryRow,
} from "./share-summary";

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
  const [canUseNativeShare, setCanUseNativeShare] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setShareUrl(window.location.href);
  }, [sharePath]);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setCanUseNativeShare(typeof navigator.share === "function");
  }, []);

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

  const reportShareTelemetry = useCallback(
    (outcome: string, channel: string) => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("share:result", {
            detail: { matchId, channel, outcome },
          })
        );
      }
      console.info("[share]", { matchId, channel, outcome });
    },
    [matchId]
  );

  const resolvedUrl = shareUrl || sharePath;
  const sharePayload = useMemo(
    () =>
      buildShareSummaryPayload({
        matchTitle,
        matchUrl: resolvedUrl,
        participants,
        summaryColumns,
        summaryRows,
        meta,
        status,
        playedAt,
        location,
      }),
    [
      location,
      matchTitle,
      meta,
      participants,
      playedAt,
      resolvedUrl,
      status,
      summaryColumns,
      summaryRows,
    ]
  );

  const prefilledLinks = useMemo(
    () => buildPrefilledShareLinks(sharePayload),
    [sharePayload]
  );

  const matchMetaLines = sharePayload.metaLines;

  const handleCopyLink = useCallback(async () => {
    const url = resolvedUrl;
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
      reportShareTelemetry("success", "copy-link");
    } catch (error) {
      console.error("Unable to copy match link", error);
      setFeedback("Unable to copy match link. Try copying the URL manually.");
      reportShareTelemetry("error", "copy-link");
    } finally {
      setMenuOpen(false);
    }
  }, [reportShareTelemetry, resolvedUrl]);

  const handleCopySummary = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(sharePayload.shareText);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = sharePayload.shareText;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setFeedback("Match summary copied to clipboard");
      reportShareTelemetry("success", "copy-summary");
    } catch (error) {
      console.error("Unable to copy match summary", error);
      setFeedback("Unable to copy summary. Try copying the URL manually.");
      reportShareTelemetry("error", "copy-summary");
    } finally {
      setMenuOpen(false);
    }
  }, [reportShareTelemetry, sharePayload.shareText]);

  const handleNativeShare = useCallback(async () => {
    if (!canUseNativeShare) {
      setFeedback("Device sharing is not available in this browser.");
      reportShareTelemetry("fallback", "native");
      return;
    }

    try {
      await navigator.share({
        title: matchTitle,
        text: sharePayload.shareText,
        url: sharePayload.matchUrl,
      });
      setFeedback("Share sheet opened successfully");
      reportShareTelemetry("success", "native");
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && (error as { name?: string }).name === "AbortError") {
        setFeedback("Share cancelled");
        reportShareTelemetry("cancel", "native");
      } else {
        console.error("Unable to open native share", error);
        setFeedback("Unable to open native share. Try another option.");
        reportShareTelemetry("error", "native");
      }
    } finally {
      setMenuOpen(false);
    }
  }, [
    canUseNativeShare,
    matchTitle,
    reportShareTelemetry,
    sharePayload.matchUrl,
    sharePayload.shareText,
  ]);

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

    if (sharePayload.cards.length) {
      lines.push("");
      sharePayload.cards.forEach((card) => {
        lines.push(
          `${escapeCsvValue(card.title)},${escapeCsvValue(card.body)}`
        );
      });
    }

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
  }, [matchMetaLines, matchTitle, participants, sharePayload.cards, summaryColumns, summaryRows]);

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
      reportShareTelemetry("success", "export-csv");
    } catch (error) {
      console.error("Unable to export match CSV", error);
      setFeedback("Unable to export CSV. Please try again.");
      reportShareTelemetry("error", "export-csv");
    } finally {
      setMenuOpen(false);
    }
  }, [buildCsvContent, matchId, reportShareTelemetry]);

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
        lines.forEach((line: string) => {
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

      if (sharePayload.cards.length) {
        doc.setFontSize(12);
        sharePayload.cards.forEach((card) => {
          writeLines(`${card.title}: ${card.body}`);
        });
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
      reportShareTelemetry("success", "export-pdf");
    } catch (error) {
      console.error("Unable to export match PDF", error);
      setFeedback("Unable to export PDF. Please try again.");
      reportShareTelemetry("error", "export-pdf");
    } finally {
      setMenuOpen(false);
    }
  }, [
    matchId,
    matchMetaLines,
    matchTitle,
    participants,
    reportShareTelemetry,
    sharePayload.cards,
    summaryColumns,
    summaryRows,
  ]);

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
        <div className="share-match__menu" role="menu" aria-label="Share options">
          <button
            type="button"
            className="share-match__menu-item"
            role="menuitem"
            onClick={handleNativeShare}
            aria-disabled={!canUseNativeShare}
            disabled={!canUseNativeShare}
          >
            Share via device
          </button>
          {!canUseNativeShare ? (
            <p className="share-match__menu-note" role="note">
              Native sharing is unavailable in this browser. Try the options below.
            </p>
          ) : null}
          <button
            type="button"
            className="share-match__menu-item"
            role="menuitem"
            onClick={handleCopySummary}
          >
            Copy summary text
          </button>
          <button
            type="button"
            className="share-match__menu-item"
            role="menuitem"
            onClick={handleCopyLink}
          >
            Copy link
          </button>
          <a
            className="share-match__menu-item"
            role="menuitem"
            href={prefilledLinks.x}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              reportShareTelemetry("prefilled", "x");
              setMenuOpen(false);
            }}
          >
            Share on X (Twitter)
          </a>
          <a
            className="share-match__menu-item"
            role="menuitem"
            href={prefilledLinks.whatsapp}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              reportShareTelemetry("prefilled", "whatsapp");
              setMenuOpen(false);
            }}
          >
            Share on WhatsApp
          </a>
          <a
            className="share-match__menu-item"
            role="menuitem"
            href={prefilledLinks.telegram}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              reportShareTelemetry("prefilled", "telegram");
              setMenuOpen(false);
            }}
          >
            Share on Telegram
          </a>
          <a
            className="share-match__menu-item"
            role="menuitem"
            href={prefilledLinks.sms}
            onClick={() => {
              reportShareTelemetry("prefilled", "sms");
              setMenuOpen(false);
            }}
          >
            Send via SMS/DM
          </a>
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
