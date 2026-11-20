import type { ListingSummary } from '../api/types';
import { channelChips } from '../lib/channel-status';
import { PHASE_BADGE, statusInfo } from '../ui/phase';

export function ChannelMarks({ listings }: { listings: ListingSummary[] }) {
  const chips = channelChips(listings);
  if (chips.length === 0) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Status je Kanal">
      {chips.map((chip) => {
        const { phase } = statusInfo(chip.status);
        return (
          <li key={chip.marketplaceId}>
            <span
              className={`inline-flex items-center max-w-full h-5 px-1.5 rounded-full text-micro normal-case tracking-normal ${PHASE_BADGE[phase]}`}
            >
              <span className="sr-only">{chip.label}: </span>
              <span aria-hidden="true" className="truncate">
                {chip.label} · {chip.statusLabel}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
