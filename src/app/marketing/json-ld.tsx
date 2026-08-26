/**
 * JSON-LD as a script tag. Server-rendered, no client JavaScript.
 *
 * `JSON.stringify` output is escaped for the one sequence that could close
 * the script element early; the data is ours, but a copy task will edit it.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
