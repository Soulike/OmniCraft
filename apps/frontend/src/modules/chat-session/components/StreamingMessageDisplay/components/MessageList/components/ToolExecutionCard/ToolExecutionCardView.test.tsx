import {describe, expect, it, vi} from 'vitest';

type JSDOMConstructor = new (
  html: string,
  options?: {url?: string},
) => {window: Window & typeof globalThis};

// @ts-expect-error jsdom is available in the workspace but has no bundled types.
const {JSDOM} = (await import('jsdom')) as {JSDOM: JSDOMConstructor};
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
});
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
for (const property of Object.getOwnPropertyNames(dom.window)) {
  if (property in globalThis) continue;

  const descriptor = Object.getOwnPropertyDescriptor(dom.window, property);
  if (descriptor === undefined) continue;

  Object.defineProperty(globalThis, property, descriptor);
}
globalThis.requestAnimationFrame = (callback: FrameRequestCallback) =>
  window.setTimeout(() => {
    callback(performance.now());
  }, 0);
globalThis.cancelAnimationFrame = (id: number) => {
  window.clearTimeout(id);
};
globalThis.ResizeObserver = class ResizeObserver {
  observe() {
    return undefined;
  }
  unobserve() {
    return undefined;
  }
  disconnect() {
    return undefined;
  }
};

vi.mock('./components/ResultSection/index.js', () => ({
  ResultSection: () => null,
}));

await import('@testing-library/jest-dom/vitest');
const {render, screen} = await import('@testing-library/react');
const {ToolExecutionCardView} = await import('./ToolExecutionCardView.js');

describe('ToolExecutionCardView', () => {
  it('renders display name, adapter target, adapter detail, and done meta for run_command', () => {
    render(
      <ToolExecutionCardView
        arguments={JSON.stringify({command: 'bun test', timeout: 30000})}
        displayName='Run command'
        status='done'
        toolName='run_command'
      />,
    );

    expect(screen.getByText('Run command')).toBeInTheDocument();
    expect(screen.getByText('bun test')).toBeInTheDocument();
    expect(screen.getByText('30s timeout')).toBeInTheDocument();
    expect(screen.getByText('done')).toBeInTheDocument();
  });

  it('renders live output meta for a running tool with streamed output', () => {
    render(
      <ToolExecutionCardView
        arguments={JSON.stringify({command: 'bun test'})}
        displayName='Run command'
        output='watching files...'
        status='running'
        toolName='run_command'
      />,
    );

    expect(screen.getByText('live output')).toBeInTheDocument();
  });

  it('renders failed and error meta for failure and error rows', () => {
    render(
      <>
        <ToolExecutionCardView
          arguments={JSON.stringify({command: 'bun test'})}
          displayName='Run command'
          status='failure'
          toolName='run_command'
        />
        <ToolExecutionCardView
          arguments={JSON.stringify({command: 'bun build'})}
          displayName='Run command'
          status='error'
          toolName='run_command'
        />
      </>,
    );

    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.getByText('error')).toBeInTheDocument();
  });
});
