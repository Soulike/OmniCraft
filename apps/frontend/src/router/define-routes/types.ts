/** Recursive tree structure describing route segments. */
export interface RouteTree {
  [segment: string]: RouteTree;
}

/** Maps each key in a RouteTree to a callable node with nested children. */
export type BuildRoutes<T extends RouteTree> = {
  [K in keyof T]: (() => string) & BuildRoutes<T[K]>;
};
