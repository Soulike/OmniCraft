import escapeHtml from 'escape-html';

/**
 * Escapes untrusted reminder text before it is embedded in a privileged
 * `<system-reminder>` wrapper, so it cannot break out of that wrapper
 * (second-order prompt injection).
 *
 * Rather than denylisting `<system-reminder>` delimiter variants — an
 * open-ended game against self-closing forms, attribute-bearing tags, Unicode
 * slash/less-than look-alikes, and invisible characters wedged inside the tag
 * name — we escape the structural characters themselves. With every `<`, `>`,
 * and `&` turned into an HTML entity, no closing tag (of any spelling) can form
 * in the content: the only real `<system-reminder>` the model sees is the
 * wrapper we add. `escape-html` is a tiny, widely-used library (already a
 * transitive dependency via Koa); the Node standard library has no HTML-escape
 * primitive and `Bun.escapeHTML` is disallowed by project convention.
 *
 * This also preserves content fidelity: a legitimate subject like
 * `refactor <Modal> generics` survives as `refactor &lt;Modal&gt; generics`
 * (which the model reads correctly) instead of being mangled by stripping.
 */
export function sanitizeReminderContent(content: string): string {
  return escapeHtml(content);
}
