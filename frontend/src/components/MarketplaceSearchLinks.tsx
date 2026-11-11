import type { MarketplaceSearchLink } from '../api/types';
import { Icon } from '../ui';

export function MarketplaceSearchLinks({ links }: { links: MarketplaceSearchLink[] | undefined }) {
  if (!links?.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {links.map((link) => (
        <li key={link.platform}>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            title={link.note ?? undefined}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full border border-line bg-surface text-label text-ink hover:border-accent hover:text-accent"
          >
            {link.label}
            <Icon name="external" size={12} />
          </a>
        </li>
      ))}
    </ul>
  );
}
