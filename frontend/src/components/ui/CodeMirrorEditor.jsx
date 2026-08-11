import React, { useMemo, useState, useCallback } from 'react';
import CodeMirror, { EditorView, keymap, Prec } from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { sql, SQLite } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { WrapText, Minus, Plus } from 'lucide-react';

/**
 * CodeMirror implementation behind CodeEditor.jsx.
 *
 * Kept in its own module so CodeEditor.jsx can pull it in with React.lazy: CodeMirror plus
 * three language grammars is roughly half a megabyte, and only candidates who are actually
 * served a coding question ever need it. Imported directly it landed in the main entry
 * chunk, which every admin and every non-coding candidate downloads for nothing.
 * Import this file directly only if you genuinely want it eagerly.
 *
 * The code editor shared by the interview sandbox and the admin practice sandbox.
 *
 * Both screens previously carried their own copy of a textarea with a hand-rendered line
 * gutter — no highlighting, no auto-indent, no bracket handling. Candidates write real
 * Python/JavaScript/SQL under a timer, and plain monospace text is genuinely harder to
 * read and to spot mistakes in than the syntax-coloured editor every online compiler and
 * every editor they have ever practised in gives them. This replaces both copies.
 *
 * Kept deliberately dark in both app themes. Editors are conventionally dark, the previous
 * textarea was already dark regardless of theme, and switching it would make the console
 * directly beneath it (also dark) look detached.
 *
 * CodeMirror rather than Monaco on purpose: during an interview this runs alongside
 * MediaPipe FaceMesh + Hands, face-api identity checks, two MediaRecorders and the Web
 * Speech API, all in the same tab. Monaco's footprint on a low-end laptop in that company
 * is a real risk to the thing that actually matters — the recording and the proctoring.
 */

const LANGUAGE_EXTENSIONS = {
  python: () => python(),
  javascript: () => javascript(),
  // SQLite specifically: the backend grades SQL answers on an in-memory SQLite database,
  // so the dialect the editor completes against should be the one that will run.
  sql: () => sql({ dialect: SQLite }),
};

const MIN_FONT_SIZE = 11;
const MAX_FONT_SIZE = 20;
const DEFAULT_FONT_SIZE = 13;

const CodeEditor = ({
  value,
  onChange,
  language = 'python',
  /** Fired on Ctrl/Cmd+Enter — the run shortcut every online compiler binds. */
  onRun,
  disabled = false,
  className = '',
  /** Hide the Ln/Col + font-size strip where vertical space is tight. */
  showStatusBar = true,
}) => {
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [wrap, setWrap] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });

  const handleUpdate = useCallback((viewUpdate) => {
    // Only recompute on an actual cursor/selection move — this fires on every keystroke
    // and every scroll otherwise.
    if (!viewUpdate.selectionSet && !viewUpdate.docChanged) return;
    const { state } = viewUpdate;
    const pos = state.selection.main.head;
    const line = state.doc.lineAt(pos);
    setCursor({ line: line.number, col: pos - line.from + 1 });
  }, []);

  const extensions = useMemo(() => {
    const langExtension = LANGUAGE_EXTENSIONS[language] || LANGUAGE_EXTENSIONS.python;
    const list = [
      langExtension(),
      // Prec.highest so the run shortcut wins over CodeMirror's own Mod-Enter binding
      // (insert newline and indent), which would otherwise swallow it.
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              if (onRun && !disabled) onRun();
              return true;
            },
          },
        ])
      ),
      EditorView.theme({
        '&': { fontSize: `${fontSize}px`, height: '100%' },
        '.cm-scroller': {
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
          lineHeight: '1.6',
        },
        '.cm-content': { paddingBlock: '10px' },
        '.cm-gutters': { borderRight: '1px solid rgb(30 41 59)' },
        // The editor is the tallest thing in the pane; let it own the space it is given
        // rather than growing the layout.
        '&.cm-editor': { height: '100%' },
        '&.cm-focused': { outline: 'none' },
      }),
    ];
    if (wrap) list.push(EditorView.lineWrapping);
    return list;
  }, [language, fontSize, wrap, onRun, disabled]);

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div className="flex-1 min-h-0 overflow-hidden bg-[#282c34]">
        <CodeMirror
          value={value}
          onChange={onChange}
          onUpdate={handleUpdate}
          extensions={extensions}
          theme={oneDark}
          editable={!disabled}
          height="100%"
          style={{ height: '100%' }}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: true,
            highlightActiveLineGutter: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            indentOnInput: true,
            foldGutter: false,
            // The candidate is being timed; a search panel opening over the code on a
            // stray Ctrl+F is a distraction, not a feature.
            searchKeymap: false,
            highlightSelectionMatches: false,
          }}
        />
      </div>

      {showStatusBar && (
        <div className="shrink-0 flex items-center justify-between gap-2 px-2.5 py-1 bg-slate-900 border-t border-slate-800 text-[10px] font-mono text-slate-500 select-none">
          <span className="tabular-nums">
            Ln {cursor.line}, Col {cursor.col}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setWrap((w) => !w)}
              aria-pressed={wrap}
              title={wrap ? 'Disable word wrap' : 'Enable word wrap'}
              className={`p-1 rounded transition ${
                wrap ? 'text-primary-400 bg-primary-500/10' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <WrapText size={12} />
            </button>
            <span className="w-px h-3 bg-slate-700" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setFontSize((s) => Math.max(MIN_FONT_SIZE, s - 1))}
              disabled={fontSize <= MIN_FONT_SIZE}
              title="Decrease font size"
              aria-label="Decrease font size"
              className="p-1 rounded text-slate-500 hover:text-slate-300 disabled:opacity-30 transition"
            >
              <Minus size={12} />
            </button>
            <span className="tabular-nums w-6 text-center" aria-live="polite">{fontSize}px</span>
            <button
              type="button"
              onClick={() => setFontSize((s) => Math.min(MAX_FONT_SIZE, s + 1))}
              disabled={fontSize >= MAX_FONT_SIZE}
              title="Increase font size"
              aria-label="Increase font size"
              className="p-1 rounded text-slate-500 hover:text-slate-300 disabled:opacity-30 transition"
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CodeEditor;
