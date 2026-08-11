import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CodeEditor from './CodeEditor';

/**
 * CodeEditor is a React.lazy boundary over CodeMirror, which is deliberate — the editor
 * bundle is around half a megabyte and belongs in its own chunk rather than in the entry
 * chunk every user downloads. These tests cover the two things that lazy boundary can
 * silently break: that the real editor does eventually arrive, and that the run shortcut
 * survives the indirection.
 */

beforeAll(() => {
  // CodeMirror measures its own layout on mount; jsdom implements neither.
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} });
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON: () => ({}),
    });
  }
});

const findEditor = () => waitFor(() => {
  const el = document.querySelector('.cm-content');
  expect(el).toBeTruthy();
  return el;
}, { timeout: 5000 });

describe('CodeEditor', () => {
  it('shows a placeholder first, then loads the real editor', async () => {
    render(<CodeEditor value="x = 1" onChange={() => {}} language="python" />);

    // The fallback must exist, otherwise the pane collapses while the chunk downloads.
    expect(screen.getByRole('status')).toHaveTextContent(/loading editor/i);

    const content = await findEditor();
    expect(content.textContent).toContain('x = 1');
  });

  it('renders the code with syntax highlighting rather than as plain text', async () => {
    render(<CodeEditor value="# note\nx = 10" onChange={() => {}} language="python" />);
    await findEditor();

    // The whole point of the change: tokens are marked up individually so they can be
    // coloured. A plain textarea would give us one undifferentiated text node.
    await waitFor(() => {
      expect(document.querySelectorAll('.cm-line span').length).toBeGreaterThan(0);
    });
  });

  it('runs on Ctrl+Enter', async () => {
    const onRun = vi.fn();
    render(<CodeEditor value="x = 1" onChange={() => {}} language="python" onRun={onRun} />);
    const content = await findEditor();

    content.focus();
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() => expect(onRun).toHaveBeenCalledTimes(1));
  });

  it('does not run on Ctrl+Enter while disabled', async () => {
    const onRun = vi.fn();
    render(<CodeEditor value="x = 1" onChange={() => {}} language="python" onRun={onRun} disabled />);
    const content = await findEditor();

    content.focus();
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    expect(onRun).not.toHaveBeenCalled();
  });

  it('reports the cursor position so the status bar can show it', async () => {
    render(<CodeEditor value="x = 1" onChange={() => {}} language="python" />);
    await findEditor();

    expect(await screen.findByText(/Ln 1, Col 1/)).toBeInTheDocument();
  });

  it('hides the status bar when asked', async () => {
    render(<CodeEditor value="x = 1" onChange={() => {}} language="python" showStatusBar={false} />);
    await findEditor();

    expect(screen.queryByText(/Ln \d+, Col \d+/)).not.toBeInTheDocument();
  });
});
