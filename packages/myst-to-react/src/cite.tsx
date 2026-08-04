import classNames from 'classnames';
import { useReferences, useSiteManifest } from '@myst-theme/providers';
import type { NodeRenderer } from '@myst-theme/providers';
import { doi } from 'doi-utils';
import { InlineError } from './inlineError.js';
import { HoverPopover } from './components/index.js';
import { MyST } from './MyST.js';
import type { GenericNode, GenericParent } from 'myst-common';

function useNumberedReferences(): boolean {
  const config = useSiteManifest();
  const numbered_references = !!config?.options?.numbered_references;
  return numbered_references;
}

function useJoinedReferences(): boolean {
  const config = useSiteManifest();
  return !!config?.options?.joined_references;
}

function CiteChild({ html }: { html?: string }) {
  return (
    <div
      className="hover-document article w-[500px] sm:max-w-[500px] p-3"
      dangerouslySetInnerHTML={{ __html: html || '' }}
    />
  );
}

type Citation = GenericNode<{
  enumerator?: string;
  error?: boolean | 'not found' | 'rendering error';
  class?: string;
}>;

type CitationRange = {
  citations: Citation[];
  start: string;
  end: string;
};

function citationNumber(citation: Citation): number | undefined {
  if (!citation.enumerator || !/^\d+$/.test(citation.enumerator)) return undefined;
  return Number(citation.enumerator);
}

function joinNumericCitations(children: GenericNode[]): (Citation | CitationRange)[] | undefined {
  const citations = children as Citation[];
  if (citations.some((citation) => citation.error || citationNumber(citation) === undefined)) {
    return undefined;
  }

  const sortedCitations = [...citations].sort(
    (first, second) => citationNumber(first)! - citationNumber(second)!,
  );
  const joined: (Citation | CitationRange)[] = [];

  for (let index = 0; index < sortedCitations.length; ) {
    let endIndex = index + 1;
    while (
      endIndex < sortedCitations.length &&
      citationNumber(sortedCitations[endIndex]) === citationNumber(sortedCitations[endIndex - 1])! + 1
    ) {
      endIndex += 1;
    }

    const range = sortedCitations.slice(index, endIndex);
    if (range.length >= 3) {
      joined.push({
        citations: range,
        start: range[0].enumerator!,
        end: range[range.length - 1].enumerator!,
      });
    } else {
      joined.push(...range);
    }
    index = endIndex;
  }

  return joined;
}

function isCitationRange(citation: Citation | CitationRange): citation is CitationRange {
  return 'citations' in citation;
}

function CiteRange({ citations, start, end }: CitationRange) {
  const references = useReferences();
  const html = citations
    .map((citation) => references?.cite?.data[citation.label ?? '']?.html)
    .filter((reference): reference is string => !!reference);
  return (
    <HoverPopover
      openDelay={300}
      card={
        <div className="hover-document article w-[1000px] max-w-[calc(100vw-2rem)] p-3 sm:max-w-[1000px]">
          {html.map((reference, index) => (
            <div
              key={citations[index].label}
              className={classNames({ 'border-t border-myst-border pt-3 mt-3': index > 0 })}
              dangerouslySetInnerHTML={{ __html: reference }}
            />
          ))}
        </div>
      }
    >
      <cite className="hover-link">
        {start}–{end}
      </cite>
    </HoverPopover>
  );
}

export const CiteGroup: NodeRenderer<GenericParent> = ({ node, className }) => {
  const allCite = node.children?.every((child) => child.type === 'cite') ?? false;
  const numbered = useNumberedReferences();
  const joinedReferences = useJoinedReferences();
  const citations =
    allCite && numbered && node.kind === 'parenthetical' && joinedReferences
      ? joinNumericCitations(node.children)
      : undefined;
  return (
    <span
      className={classNames(
        {
          'cite-group': allCite,
          'xref-group': !allCite,
          narrative: node.kind === 'narrative',
          parenthetical: node.kind === 'parenthetical',
        },
        className,
      )}
    >
      {citations
        ? citations.map((citation, index) =>
            isCitationRange(citation) ? (
              <CiteRange key={`${citation.start}-${citation.end}`} {...citation} />
            ) : (
              <CiteRenderer key={`${citation.label}-${index}`} node={citation} />
            ),
          )
        : <MyST ast={node.children} />}
    </span>
  );
};

export const Cite = ({
  label,
  error,
  children,
  className,
}: {
  label?: string;
  error?: boolean;
  children: React.ReactNode;
  className?: string;
}) => {
  const references = useReferences();
  if (!label) {
    return (
      <InlineError
        value="cite (no label)"
        message={'Citation Has No Label'}
        className={className}
      />
    );
  }
  const { html, doi: doiString, url: refUrl } = references?.cite?.data[label] ?? {};
  if (error) {
    return <InlineError value={label} message={'Citation Not Found'} className={className} />;
  }
  const url = doiString ? doi.buildUrl(doiString as string) : refUrl;
  const isButtonLike = (className ?? '').split(' ').includes('button');
  return (
    <HoverPopover openDelay={300} card={<CiteChild html={html} />}>
      <cite className={className}>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className={classNames({ 'hover-link': !isButtonLike })}
          >
            {children}
          </a>
        )}
        {!url && <span className="hover-link">{children}</span>}
      </cite>
    </HoverPopover>
  );
};

export const CiteRenderer: NodeRenderer = ({ node, className }) => {
  const numbered = useNumberedReferences();
  return (
    <Cite label={node.label} error={node.error} className={classNames(className, node.class)}>
      {numbered && node.kind === 'parenthetical' ? node.enumerator : <MyST ast={node.children} />}
    </Cite>
  );
};

const CITE_RENDERERS: Record<string, NodeRenderer> = {
  citeGroup: CiteGroup,
  cite: CiteRenderer,
};

export default CITE_RENDERERS;
