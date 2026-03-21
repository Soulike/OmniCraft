import type {BuildRoutes, RouteTree} from './types.js';

/**
 * Creates a route path builder tree.
 *
 * Each node is a callable function returning its full path,
 * and also an object whose properties are child route nodes.
 *
 * @example
 * ```ts
 * const ROUTES = defineRoutes({
 *   chat: {session: {}},
 *   settings: {llm: {}},
 * });
 * ROUTES.chat();            // '/chat'
 * ROUTES.chat.session();    // '/chat/session'
 * ROUTES.settings.llm();    // '/settings/llm'
 * ```
 */
export function defineRoutes<T extends RouteTree>(tree: T): BuildRoutes<T> {
  return buildLevel(tree, '');
}

function buildLevel<T extends RouteTree>(
  tree: T,
  parentPath: string,
): BuildRoutes<T> {
  const result: Record<string, unknown> = {};

  for (const segment of Object.keys(tree)) {
    const fullPath = `${parentPath}/${segment}`;
    const children = tree[segment];
    const childNodes = buildLevel(children, fullPath);

    // A callable that returns its own path, with child nodes attached.
    const node = Object.assign(() => fullPath, childNodes);
    result[segment] = node;
  }

  return result as BuildRoutes<T>;
}
