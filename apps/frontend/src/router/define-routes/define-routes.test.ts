import {describe, expect, it} from 'vitest';

import {defineRoutes} from './define-routes.js';

describe('defineRoutes', () => {
  describe('empty tree', () => {
    it('should return an empty object for an empty tree', () => {
      const routes = defineRoutes({});
      expect(routes).toEqual(expect.objectContaining({}));
      expect(Object.keys(routes)).toHaveLength(0);
    });
  });

  describe('single flat route', () => {
    it('should return a callable function for a single route', () => {
      const routes = defineRoutes({chat: {}});
      expect(typeof routes.chat).toBe('function');
      expect(routes.chat()).toBe('/chat');
    });
  });

  describe('multiple flat routes', () => {
    it('should return callable functions for all routes', () => {
      const routes = defineRoutes({
        chat: {},
        settings: {},
        profile: {},
      });

      expect(routes.chat()).toBe('/chat');
      expect(routes.settings()).toBe('/settings');
      expect(routes.profile()).toBe('/profile');
    });
  });

  describe('nested routes (2 levels)', () => {
    it('should produce correct paths for parent and child', () => {
      const routes = defineRoutes({
        settings: {llm: {}},
      });

      expect(routes.settings()).toBe('/settings');
      expect(routes.settings.llm()).toBe('/settings/llm');
    });

    it('should handle multiple children under one parent', () => {
      const routes = defineRoutes({
        settings: {
          llm: {},
          profile: {},
          theme: {},
        },
      });

      expect(routes.settings()).toBe('/settings');
      expect(routes.settings.llm()).toBe('/settings/llm');
      expect(routes.settings.profile()).toBe('/settings/profile');
      expect(routes.settings.theme()).toBe('/settings/theme');
    });
  });

  describe('deeply nested routes (3+ levels)', () => {
    it('should produce correct paths at 3 levels', () => {
      const routes = defineRoutes({
        a: {b: {c: {}}},
      });

      expect(routes.a()).toBe('/a');
      expect(routes.a.b()).toBe('/a/b');
      expect(routes.a.b.c()).toBe('/a/b/c');
    });

    it('should produce correct paths at 4 levels', () => {
      const routes = defineRoutes({
        admin: {
          users: {
            roles: {
              permissions: {},
            },
          },
        },
      });

      expect(routes.admin()).toBe('/admin');
      expect(routes.admin.users()).toBe('/admin/users');
      expect(routes.admin.users.roles()).toBe('/admin/users/roles');
      expect(routes.admin.users.roles.permissions()).toBe(
        '/admin/users/roles/permissions',
      );
    });
  });

  describe('each node is callable', () => {
    it('should make every node callable, including intermediate ones', () => {
      const routes = defineRoutes({
        settings: {
          llm: {
            models: {},
          },
        },
      });

      expect(typeof routes.settings).toBe('function');
      expect(typeof routes.settings.llm).toBe('function');
      expect(typeof routes.settings.llm.models).toBe('function');
    });
  });

  describe('each node has correct child properties', () => {
    it('should expose child properties on parent functions', () => {
      const routes = defineRoutes({
        settings: {
          llm: {},
          profile: {},
        },
      });

      expect(routes.settings).toHaveProperty('llm');
      expect(routes.settings).toHaveProperty('profile');
      expect(typeof routes.settings.llm).toBe('function');
      expect(typeof routes.settings.profile).toBe('function');
    });

    it('should not have extra properties on leaf nodes', () => {
      const routes = defineRoutes({
        chat: {},
      });

      const ownKeys = Object.keys(routes.chat);
      expect(ownKeys).toHaveLength(0);
    });
  });

  describe('path format correctness', () => {
    it('should start paths with /', () => {
      const routes = defineRoutes({
        foo: {bar: {}},
      });

      expect(routes.foo()).toMatch(/^\//);
      expect(routes.foo.bar()).toMatch(/^\//);
    });

    it('should not have trailing slash', () => {
      const routes = defineRoutes({
        foo: {bar: {}},
      });

      expect(routes.foo()).not.toMatch(/\/$/);
      expect(routes.foo.bar()).not.toMatch(/\/$/);
    });

    it('should not have double slashes', () => {
      const routes = defineRoutes({
        foo: {bar: {baz: {}}},
      });

      expect(routes.foo()).not.toMatch(/\/\//);
      expect(routes.foo.bar()).not.toMatch(/\/\//);
      expect(routes.foo.bar.baz()).not.toMatch(/\/\//);
    });
  });

  describe('complex tree structure', () => {
    it('should handle a tree with mixed depths', () => {
      const routes = defineRoutes({
        chat: {},
        settings: {
          llm: {},
          profile: {avatar: {}},
        },
        about: {},
      });

      expect(routes.chat()).toBe('/chat');
      expect(routes.settings()).toBe('/settings');
      expect(routes.settings.llm()).toBe('/settings/llm');
      expect(routes.settings.profile()).toBe('/settings/profile');
      expect(routes.settings.profile.avatar()).toBe('/settings/profile/avatar');
      expect(routes.about()).toBe('/about');
    });

    it('should handle sibling subtrees independently', () => {
      const routes = defineRoutes({
        admin: {users: {}, roles: {}},
        public: {home: {}, faq: {}},
      });

      expect(routes.admin.users()).toBe('/admin/users');
      expect(routes.admin.roles()).toBe('/admin/roles');
      expect(routes.public.home()).toBe('/public/home');
      expect(routes.public.faq()).toBe('/public/faq');
    });
  });

  describe('return type', () => {
    it('should return strings from callable nodes', () => {
      const routes = defineRoutes({page: {}});
      const result = routes.page();
      expect(typeof result).toBe('string');
    });
  });

  describe('segment naming', () => {
    it('should preserve hyphenated segments', () => {
      const routes = defineRoutes({
        'my-page': {'sub-page': {}},
      });

      expect(routes['my-page']()).toBe('/my-page');
      expect(routes['my-page']['sub-page']()).toBe('/my-page/sub-page');
    });

    it('should preserve single character segments', () => {
      const routes = defineRoutes({
        a: {b: {c: {}}},
      });

      expect(routes.a()).toBe('/a');
      expect(routes.a.b()).toBe('/a/b');
      expect(routes.a.b.c()).toBe('/a/b/c');
    });
  });
});
