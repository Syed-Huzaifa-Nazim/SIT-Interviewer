import React, { Suspense } from 'react';

/**
 * Lazy boundary for the syntax-highlighted editor.
 *
 * CodeMirror plus the Python, JavaScript and SQL grammars is around half a megabyte. Only
 * candidates who are actually served a coding exercise need any of it, so it must not sit
 * in the entry chunk that every admin and every verbal-only candidate downloads on login —
 * which is exactly where it landed when the implementation was imported directly.
 *
 * The fallback is sized and coloured like the editor it replaces so the pane does not
 * jump when the real one arrives.
 */
const CodeMirrorEditor = React.lazy(() => import('./CodeMirrorEditor'));

const EditorSkeleton = ({ className = '' }) => (
  <div
    className={`flex items-center justify-center bg-[#282c34] text-[11px] font-mono text-slate-500 ${className}`}
    role="status"
  >
    Loading editor…
  </div>
);

const CodeEditor = ({ className = '', ...props }) => (
  <Suspense fallback={<EditorSkeleton className={className} />}>
    <CodeMirrorEditor className={className} {...props} />
  </Suspense>
);

export default CodeEditor;
