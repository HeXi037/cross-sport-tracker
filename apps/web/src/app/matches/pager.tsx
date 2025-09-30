"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ensureTrailingSlash } from "../../lib/routes";

interface PagerProps {
  limit: number;
  offset: number;
  itemCount: number;
  totalCount: number | null;
  prevOffset: number;
  nextOffset: number | null;
  disablePrev: boolean;
  disableNext: boolean;
}

export default function Pager({
  limit,
  offset,
  itemCount,
  totalCount,
  prevOffset,
  nextOffset,
  disablePrev,
  disableNext,
}: PagerProps) {
  const t = useTranslations("Pager");
  const router = useRouter();
  const basePath = ensureTrailingSlash('/matches');

  const pageNumber = Math.floor(offset / limit) + 1;
  const totalKnown =
    typeof totalCount === 'number' && Number.isFinite(totalCount);

  const statusText = (() => {
    if (itemCount <= 0) {
      return t('status.empty', { page: pageNumber });
    }
    const start = offset + 1;
    const end = offset + itemCount;
    if (totalKnown) {
      return t('status.rangeWithTotal', {
        page: pageNumber,
        start,
        end,
        total: totalCount ?? 0,
      });
    }
    return t('status.range', { page: pageNumber, start, end });
  })();

  const handlePrev = () => {
    if (disablePrev) return;
    router.push(`${basePath}?limit=${limit}&offset=${prevOffset}`);
  };

  const handleNext = () => {
    if (disableNext || nextOffset == null) return;
    router.push(`${basePath}?limit=${limit}&offset=${nextOffset}`);
  };

  return (
    <div className="pager" role="navigation" aria-label={t('matchesNavigation')}>
      <p className="pager__status" aria-live="polite">
        {statusText}
      </p>
      <div className="pager__controls">
        <button
          type="button"
          className="button"
          disabled={disablePrev}
          onClick={handlePrev}
        >
          {t('previous')}
        </button>
        <button
          type="button"
          className="button"
          disabled={disableNext}
          onClick={handleNext}
        >
          {t('next')}
        </button>
      </div>
    </div>
  );
}

