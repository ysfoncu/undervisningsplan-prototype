import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef, type ReactNode } from "react";
import {
  $createParagraphNode,
  $createRangeSelectionFromDom,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COLLABORATION_TAG,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  HISTORY_MERGE_TAG,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
  type ElementFormatType,
  type LexicalEditor,
  type RangeSelection,
  type TextFormatType,
  TextNode,
} from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { LexicalCollaboration } from "@lexical/react/LexicalCollaborationContext";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import { HeadingNode, QuoteNode, $createHeadingNode, $createQuoteNode, $isHeadingNode, $isQuoteNode } from "@lexical/rich-text";
import { ListNode, ListItemNode, INSERT_CHECK_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, REMOVE_LIST_COMMAND, $isListNode } from "@lexical/list";
import { LinkNode, AutoLinkNode, TOGGLE_LINK_COMMAND, $isLinkNode } from "@lexical/link";
import { MarkNode, $isMarkNode, $unwrapMarkNode, $wrapSelectionInMarkNode } from "@lexical/mark";
import { $patchStyleText, $setBlocksType } from "@lexical/selection";
import { $dfs, $findMatchingParent } from "@lexical/utils";
import { createProvider, getStartTemplate, mayBootstrap } from "../collab";
import { GUIDANCE_COLOR, TEMPLATE_PROMPTS } from "../data";
import { fill, L } from "../labels";
import type { Annotation, AnnotationType, User } from "../types";
import { ANN_COLOR } from "./annColors";

/**
 * The plan text: one shared Lexical document, edited live by everyone with
 * edit access (owner, Redaktør, Observatør). Annotations are MarkNodes inside
 * the document, so they move with everyone's edits.
 */

/** Update tag for adding/removing annotation marks (not logged as editing). */
const ANNOTATE_TAG = "annotate";

export interface PlanEditorHandle {
  /** Scroll to and flash every piece of a mark. */
  reveal: (id: string) => void;
  /** Perform a Stryk / Erstatt suggestion in the text. "changed" if the marked text no longer matches. */
  accept: (a: Annotation) => "ok" | "changed" | "missing";
  /** Remove the mark, keep the text. */
  dismiss: (id: string) => void;
}

const THEME = {
  paragraph: "lx-p",
  heading: { h2: "lx-h2", h3: "lx-h3", h4: "lx-h4" },
  quote: "lx-quote",
  list: {
    ul: "lx-ul",
    ol: "lx-ol",
    listitem: "lx-li",
    listitemChecked: "lx-li-checked",
    listitemUnchecked: "lx-li-unchecked",
    nested: { listitem: "lx-li-nested" },
  },
  link: "lx-link",
  mark: "ann",
  markOverlap: "ann-overlap",
  text: {
    bold: "lx-bold",
    italic: "lx-italic",
    underline: "lx-underline",
    strikethrough: "lx-strike",
    underlineStrikethrough: "lx-underline-strike",
    subscript: "lx-sub",
    superscript: "lx-sup",
    highlight: "lx-hl",
    code: "lx-code",
  },
};

export const PlanEditor = forwardRef<
  PlanEditorHandle,
  {
    planId: string;
    me: User;
    editable: boolean;
    canAnnotate: boolean;
    annotations: Annotation[];
    onMarkClick?: (id: string) => void;
    /** Ids of marks present in the document (to spot orphaned annotations). */
    onMarksChange?: (ids: Set<string>) => void;
    /** Only local edits: plain text of the document. */
    onLocalEdit?: (text: string) => void;
    onAnnotate?: (a: { id: string; type: AnnotationType; selectedText: string; note: string }) => void;
    toast: (msg: string) => void;
    compact?: boolean;
  }
>(function PlanEditor(props, ref) {
  const initialConfig = {
    namespace: `plan-${props.planId}`,
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, AutoLinkNode, MarkNode],
    theme: THEME,
    editable: props.editable,
    // The Yjs document owns the content, not Lexical.
    editorState: null,
    onError: (e: Error) => console.error(e),
  };
  const cursors = useRef<HTMLDivElement>(null);
  // Must keep its identity: the collaboration plugin reconnects when it changes.
  const awarenessData = useMemo(() => ({ userId: props.me.id }), [props.me.id]);

  return (
    <LexicalCollaboration>
      <LexicalComposer initialConfig={initialConfig}>
        <div className={`lx-editor ${props.editable ? "is-editable" : "is-readonly"} ${props.compact ? "is-compact" : ""}`}>
          {props.editable && <Toolbar />}
          <div className="lx-body" ref={cursors}>
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  className="plan-text rich lx-content"
                  lang="nb"
                  aria-label={L.secPlan}
                  aria-placeholder={L.planPh}
                  placeholder={<div className="lx-placeholder">{props.editable ? L.planPh : L.emptyPlan}</div>}
                />
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
          </div>
          <CollaborationPlugin
            id={props.planId}
            providerFactory={createProvider}
            shouldBootstrap={mayBootstrap(props.planId)}
            initialEditorState={getStartTemplate(props.planId)}
            username={props.me.name}
            cursorColor={props.me.color}
            awarenessData={awarenessData}
            cursorsContainerRef={cursors}
          />
          <ListPlugin />
          <CheckListPlugin />
          <LinkPlugin validateUrl={(u) => /^(https?:|mailto:)/i.test(u)} />
          {props.editable && <TabIndentationPlugin maxIndent={4} />}
          <EditablePlugin editable={props.editable} />
          <MarksPlugin ref={ref} {...props} />
          <LocalEditPlugin onLocalEdit={props.onLocalEdit} />
          <GuidancePlugin />
          {props.canAnnotate && <SelectionMenu onAnnotate={props.onAnnotate} toast={props.toast} />}
        </div>
      </LexicalComposer>
    </LexicalCollaboration>
  );
});

// ─── Plugins ────────────────────────────────────────────────────────────────

function EditablePlugin({ editable }: { editable: boolean }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => editor.setEditable(editable), [editor, editable]);
  return null;
}

/** Reports plain text after the user's own edits (not remote ones, not the seed). */
/**
 * Template prompts (grey italic) behave like placeholder text in a Word
 * template: putting the cursor in one selects the whole prompt, and typing
 * replaces it with normal text.
 */
function isGuidanceColor(css: string): boolean {
  return css.replace(/\s/g, "") === "rgb(107,119,140)" || css.toLowerCase() === GUIDANCE_COLOR;
}

function GuidancePlugin() {
  const [editor] = useLexicalComposerContext();
  // The prompt this plugin last selected as a whole; a click inside it again places the cursor.
  const selectedPrompt = useRef<string | null>(null);
  // Once a prompt's text changes (typed over or edited), it becomes normal text.
  useEffect(
    () =>
      editor.registerNodeTransform(TextNode, (node) => {
        if (node.getStyle().includes(GUIDANCE_COLOR) && !TEMPLATE_PROMPTS.has(node.getTextContent())) {
          node.setStyle("");
          node.setFormat(0);
        }
      }),
    [editor],
  );
  useEffect(
    () =>
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          if (!editor.isEditable()) return false;
          const sel = $getSelection();
          if (!$isRangeSelection(sel)) return false;
          const node = sel.anchor.getNode();
          if (!$isTextNode(node) || !node.getStyle().includes(GUIDANCE_COLOR)) {
            selectedPrompt.current = null;
            return false;
          }
          // First click selects the whole prompt; a second click in it places the cursor.
          if (!sel.isCollapsed() || selectedPrompt.current === node.getKey()) return false;
          selectedPrompt.current = node.getKey();
          sel.anchor.set(node.getKey(), 0, "text");
          sel.focus.set(node.getKey(), node.getTextContentSize(), "text");
          sel.format = 0;
          sel.setStyle("");
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor],
  );
  return null;
}

function LocalEditPlugin({ onLocalEdit }: { onLocalEdit?: (text: string) => void }) {
  const [editor] = useLexicalComposerContext();
  const cb = useRef(onLocalEdit);
  cb.current = onLocalEdit;
  useEffect(() => {
    let timer = 0;
    const off = editor.registerUpdateListener(({ editorState, tags, dirtyElements, dirtyLeaves }) => {
      // Remote edits, the seed, and adding/removing marks are not text edits.
      if (tags.has(COLLABORATION_TAG) || tags.has(HISTORY_MERGE_TAG) || tags.has(ANNOTATE_TAG)) return;
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => cb.current?.(editorState.read(() => $getRoot().getTextContent())), 600);
    });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, [editor]);
  return null;
}

function $marksWithId(id: string): MarkNode[] {
  return $dfs()
    .map((d) => d.node)
    .filter((n): n is MarkNode => $isMarkNode(n) && n.hasID(id));
}

/** Styles marks by annotation type, handles clicks, exposes reveal/accept/dismiss. */
const MarksPlugin = forwardRef<
  PlanEditorHandle,
  { annotations: Annotation[]; onMarkClick?: (id: string) => void; onMarksChange?: (ids: Set<string>) => void }
>(function MarksPlugin({ annotations, onMarkClick, onMarksChange }, ref) {
  const [editor] = useLexicalComposerContext();
  const anns = useRef(annotations);
  anns.current = annotations;
  const changeCb = useRef(onMarksChange);
  changeCb.current = onMarksChange;
  const lastIds = useRef("");

  const paint = useCallback(() => {
    const byId = new Map(anns.current.map((a) => [a.id, a]));
    const ids = new Set<string>();
    editor.getEditorState().read(() => {
      for (const { node } of $dfs()) {
        if (!$isMarkNode(node)) continue;
        const el = editor.getElementByKey(node.getKey());
        node.getIDs().forEach((i) => ids.add(i));
        if (!el) continue;
        const a = node
          .getIDs()
          .map((i) => byId.get(i))
          .find((x) => x && !x.outcome);
        el.dataset.ann = a?.id ?? "";
        el.className = a ? `ann ann-${a.type}` : "ann ann-none";
        if (a?.type === "text") el.dataset.note = a.note;
        else delete el.dataset.note;
        el.title = a ? `${L.annType[a.type]}${a.note ? `: ${a.type === "text" ? fill(L.annReplaceWith, { text: a.note }) : a.note}` : ""}` : "";
      }
    });
    // Report only real changes, so the parent does not re-render on every keystroke.
    const sig = [...ids].sort().join(",");
    if (sig !== lastIds.current) {
      lastIds.current = sig;
      changeCb.current?.(ids);
    }
  }, [editor]);

  useEffect(() => paint(), [annotations, paint]);
  useEffect(() => editor.registerUpdateListener(() => paint()), [editor, paint]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("mark[data-ann]");
      if (el?.dataset.ann && window.getSelection()?.isCollapsed) onMarkClick?.(el.dataset.ann);
    };
    return editor.registerRootListener((root, prev) => {
      prev?.removeEventListener("click", onClick);
      root?.addEventListener("click", onClick);
    });
  }, [editor, onMarkClick]);

  useImperativeHandle(ref, () => ({
    reveal: (id) => {
      const keys = editor.getEditorState().read(() => $marksWithId(id).map((n) => n.getKey()));
      const els = keys.map((k) => editor.getElementByKey(k)).filter((x): x is HTMLElement => !!x);
      els[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
      els.forEach((el) => {
        el.classList.add("is-focused");
        window.setTimeout(() => el.classList.remove("is-focused"), 1600);
      });
    },
    accept: (a) => {
      let result: "ok" | "changed" | "missing" = "missing";
      editor.update(
        () => {
          const nodes = $marksWithId(a.id);
          if (!nodes.length) return;
          const current = nodes.map((n) => n.getTextContent()).join("");
          if (current !== a.selectedText) {
            result = "changed";
            return;
          }
          $setSelection(null);
          if (a.type === "text") {
            // Edit the first text node in place (keeps its formatting), drop the rest.
            const texts = nodes.flatMap((n) => n.getAllTextNodes()) as TextNode[];
            if (texts.length) {
              texts[0].setTextContent(a.note);
              texts.slice(1).forEach((t) => t.remove());
            } else nodes[0].append($createTextNode(a.note));
            nodes.forEach((n) => (n.getChildrenSize() ? $unwrapMarkNode(n) : n.remove()));
          } else {
            nodes.forEach((n) => n.remove());
          }
          result = "ok";
        },
        { discrete: true },
      );
      // Tidy the double space a deletion leaves (after Lexical merged the text nodes).
      if ((result as string) === "ok")
        editor.update(
          () => {
            for (const { node } of $dfs()) {
              if ($isTextNode(node) && /\S {2,}\S| +[.,;:!?]/.test(node.getTextContent())) {
                node.setTextContent(node.getTextContent().replace(/(\S) {2,}(?=\S)/g, "$1 ").replace(/(\S) +([.,;:!?])/g, "$1$2"));
              }
            }
          },
          { discrete: true },
        );
      return result;
    },
    dismiss: (id) => {
      editor.update(
        () => {
          $marksWithId(id).forEach((n) => (n.getIDs().length > 1 ? n.deleteID(id) : $unwrapMarkNode(n)));
        },
        { discrete: true, tag: ANNOTATE_TAG },
      );
    },
  }));
  return null;
});

// ─── Selection menu → annotate ──────────────────────────────────────────────

const TYPES: AnnotationType[] = ["highlight", "strikeout", "text"];

/** Google Docs style: select text, a small menu appears, pick a type, add a note. */
function SelectionMenu({ onAnnotate, toast }: { onAnnotate?: (a: { id: string; type: AnnotationType; selectedText: string; note: string }) => void; toast: (m: string) => void }) {
  const [editor] = useLexicalComposerContext();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [pending, setPending] = useState<{ x: number; y: number; type: AnnotationType; text: string; sel: RangeSelection } | null>(null);
  const [note, setNote] = useState("");

  // Follow the browser selection, so annotating works on locked (read-only) text too.
  useEffect(() => {
    if (pending) return;
    const onSel = () => {
      const ds = window.getSelection();
      const root = editor.getRootElement();
      if (!ds || ds.isCollapsed || !ds.rangeCount || !root || !root.contains(ds.anchorNode) || !root.contains(ds.focusNode) || !ds.toString().trim()) return setPos(null);
      // A selected template prompt is about to be typed over, not annotated.
      const el = ds.anchorNode?.parentElement;
      if (ds.anchorNode === ds.focusNode && el?.style.color && el.closest("[data-lexical-text]") && isGuidanceColor(el.style.color)) return setPos(null);
      const r = ds.getRangeAt(0).getBoundingClientRect();
      setPos(r.width ? { x: r.left + r.width / 2, y: r.top } : null);
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, [editor, pending]);

  const pick = (type: AnnotationType) => {
    let info: { text: string; sel: RangeSelection } | null = null;
    let clash = false;
    editor.read(() => {
      const s = $createRangeSelectionFromDom(window.getSelection(), editor);
      if (!s || s.isCollapsed()) return;
      clash = s.getNodes().some((n) => $isMarkNode(n) || !!$findMatchingParent(n, $isMarkNode));
      info = { text: s.getTextContent(), sel: s.clone() };
    });
    if (clash) {
      toast(L.annOverlap);
      return;
    }
    if (!info || !pos) return;
    setNote("");
    setPending({ ...pos, type, ...(info as { text: string; sel: RangeSelection }) });
    setPos(null);
  };

  const save = () => {
    if (!pending) return;
    if (pending.type === "text" && !note.trim()) return toast(L.annReplaceRequired);
    const id = "a-" + Math.random().toString(36).slice(2, 9);
    let ok = false;
    editor.update(
      () => {
        $setSelection(pending.sel.clone());
        const s = $getSelection();
        if (!$isRangeSelection(s) || s.isCollapsed()) return;
        $wrapSelectionInMarkNode(s, s.isBackward(), id);
        // The wrap splits text nodes; a selection left pointing at them breaks the next update.
        $setSelection(null);
        ok = true;
      },
      { discrete: true, tag: ANNOTATE_TAG },
    );
    if (ok) onAnnotate?.({ id, type: pending.type, selectedText: pending.text, note: note.trim() });
    else toast(L.annUnanchored);
    setPending(null);
  };

  return (
    <>
      {pos && (
        <div className="sel-menu" style={{ left: pos.x, top: pos.y }} role="toolbar" aria-label={L.annTypesTitle} onMouseDown={(e) => e.preventDefault()}>
          {TYPES.map((t) => (
            <button key={t} type="button" className="sel-btn" style={{ color: ANN_COLOR[t] }} onClick={() => pick(t)}>
              {L.annType[t]}
            </button>
          ))}
        </div>
      )}
      {pending && (
        <NotePopover
          x={pending.x}
          y={pending.y}
          type={pending.type}
          text={pending.text}
          note={note}
          setNote={setNote}
          save={save}
          close={() => setPending(null)}
        />
      )}
    </>
  );
}

function NotePopover({ x, y, type, text, note, setNote, save, close }: { x: number; y: number; type: AnnotationType; text: string; note: string; setNote: (s: string) => void; save: () => void; close: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    const down = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && close();
    window.addEventListener("keydown", key);
    window.addEventListener("mousedown", down);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("mousedown", down);
    };
  }, [close]);
  const left = Math.min(Math.max(x, 160), window.innerWidth - 160);
  return (
    <div ref={box} className="ann-pop" style={{ left, top: Math.max(y - 10, 130) }} role="dialog" aria-label={L.annType[type]}>
      <span className="ann-pop-title" style={{ color: ANN_COLOR[type] }}>
        {L.annType[type]}
      </span>
      <p className={`ann-quote ${type !== "highlight" ? "is-struck" : ""}`}>
        «{text.slice(0, 90)}
        {text.length > 90 ? "…" : ""}»
      </p>
      <label className="sr-only" htmlFor="ann-note">
        {type === "text" ? L.annReplacePh : L.annNotePh}
      </label>
      <textarea
        id="ann-note"
        autoFocus
        rows={3}
        value={note}
        placeholder={type === "text" ? L.annReplacePh : L.annNotePh}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
        }}
      />
      <div className="row end">
        <button className="btn" onClick={close}>
          {L.cancel}
        </button>
        <button className="btn btn-primary" onClick={save}>
          {L.save}
        </button>
      </div>
    </div>
  );
}

// ─── Toolbar ────────────────────────────────────────────────────────────────

const TEXT_COLORS = ["#172B4D", "#DE350B", "#FF8B00", "#00875A", "#0052CC", "#6554C0", "#6B778C"];
const MARK_COLORS = ["#FFF0B3", "#FFD5CC", "#E3FCEF", "#DEEBFF", "#EAE6FF"];
type Block = "paragraph" | "h2" | "h3" | "h4" | "quote" | "bullet" | "number" | "check";

interface ToolState {
  block: Block;
  formats: Set<TextFormatType>;
  align: ElementFormatType;
  link: boolean;
  color: string;
  canUndo: boolean;
  canRedo: boolean;
}

function readToolState(editor: LexicalEditor, prev: ToolState): ToolState {
  return editor.getEditorState().read(() => {
    const s = $getSelection();
    if (!$isRangeSelection(s)) return prev;
    const anchor = s.anchor.getNode();
    const top = anchor.getKey() === "root" ? anchor : anchor.getTopLevelElementOrThrow();
    let block: Block = "paragraph";
    const list = $findMatchingParent(anchor, $isListNode);
    if (list && $isListNode(list)) block = list.getListType();
    else if ($isHeadingNode(top)) block = top.getTag() as Block;
    else if ($isQuoteNode(top)) block = "quote";
    const formats = new Set<TextFormatType>(
      (["bold", "italic", "underline", "strikethrough", "subscript", "superscript"] as TextFormatType[]).filter((f) => s.hasFormat(f)),
    );
    const el = $isElementNode(top) ? top : null;
    const style = $isTextNode(anchor) ? anchor.getStyle() : "";
    const color = /(?:^|;)\s*color:\s*([^;]+)/.exec(style)?.[1] ?? "#172B4D";
    return {
      ...prev,
      block,
      formats,
      align: el?.getFormatType() ?? "",
      link: !!$findMatchingParent(anchor, $isLinkNode),
      color,
    };
  });
}

function Toolbar() {
  const [editor] = useLexicalComposerContext();
  const [st, setSt] = useState<ToolState>({ block: "paragraph", formats: new Set(), align: "", link: false, color: "#172B4D", canUndo: false, canRedo: false });

  useEffect(() => {
    const offs = [
      editor.registerUpdateListener(() => setSt((p) => readToolState(editor, p))),
      editor.registerCommand(CAN_UNDO_COMMAND, (v) => (setSt((p) => ({ ...p, canUndo: v })), false), COMMAND_PRIORITY_LOW),
      editor.registerCommand(CAN_REDO_COMMAND, (v) => (setSt((p) => ({ ...p, canRedo: v })), false), COMMAND_PRIORITY_LOW),
    ];
    return () => offs.forEach((f) => f());
  }, [editor]);

  const fmt = (f: TextFormatType) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, f);
  const style = (patch: Record<string, string | null>) =>
    editor.update(() => {
      const s = $getSelection();
      if ($isRangeSelection(s)) $patchStyleText(s, patch);
    });
  const setBlock = (b: Block) => {
    if (b === "bullet") return editor.dispatchCommand(st.block === "bullet" ? REMOVE_LIST_COMMAND : INSERT_UNORDERED_LIST_COMMAND, undefined);
    if (b === "number") return editor.dispatchCommand(st.block === "number" ? REMOVE_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND, undefined);
    if (b === "check") return editor.dispatchCommand(st.block === "check" ? REMOVE_LIST_COMMAND : INSERT_CHECK_LIST_COMMAND, undefined);
    editor.update(() => {
      const s = $getSelection();
      if (!$isRangeSelection(s)) return;
      if (b === "paragraph") $setBlocksType(s, () => $createParagraphNode());
      else if (b === "quote") $setBlocksType(s, () => $createQuoteNode());
      else $setBlocksType(s, () => $createHeadingNode(b));
    });
  };
  const clear = () =>
    editor.update(() => {
      const s = $getSelection();
      if (!$isRangeSelection(s)) return;
      s.getNodes().forEach((n) => {
        if ($isTextNode(n)) n.setFormat(0).setStyle("");
      });
    });
  const selectValue = ["bullet", "number", "check"].includes(st.block) ? "paragraph" : st.block;

  return (
    <div className="rt-toolbar" role="toolbar" aria-label={L.rt.toolbar}>
      <Group>
        <Btn label={L.rt.undo} keys="⌘Z" disabled={!st.canUndo} onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}>
          <Svg d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />
        </Btn>
        <Btn label={L.rt.redo} disabled={!st.canRedo} onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}>
          <Svg d="M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3" />
        </Btn>
      </Group>
      <Group>
        <label className="sr-only" htmlFor="rt-block">
          {L.rt.style}
        </label>
        <select id="rt-block" className="rt-select" value={selectValue} onChange={(e) => setBlock(e.target.value as Block)}>
          <option value="paragraph">{L.rt.paragraph}</option>
          <option value="h2">{L.rt.h2}</option>
          <option value="h3">{L.rt.h3}</option>
          <option value="h4">{L.rt.h4}</option>
          <option value="quote">{L.rt.quote}</option>
        </select>
      </Group>
      <Group>
        <Btn label={L.rt.bold} keys="⌘B" active={st.formats.has("bold")} onClick={() => fmt("bold")}>
          <b>B</b>
        </Btn>
        <Btn label={L.rt.italic} keys="⌘I" active={st.formats.has("italic")} onClick={() => fmt("italic")}>
          <i style={{ fontFamily: "Georgia, serif" }}>I</i>
        </Btn>
        <Btn label={L.rt.underline} keys="⌘U" active={st.formats.has("underline")} onClick={() => fmt("underline")}>
          <u>U</u>
        </Btn>
        <Btn label={L.rt.strike} active={st.formats.has("strikethrough")} onClick={() => fmt("strikethrough")}>
          <s>S</s>
        </Btn>
        <span className="rt-wide">
          <Btn label={L.rt.sub} active={st.formats.has("subscript")} onClick={() => fmt("subscript")}>
            <span className="rt-script">
              x<sub>2</sub>
            </span>
          </Btn>
          <Btn label={L.rt.sup} active={st.formats.has("superscript")} onClick={() => fmt("superscript")}>
            <span className="rt-script">
              x<sup>2</sup>
            </span>
          </Btn>
        </span>
      </Group>
      <Group>
        <Swatches
          label={L.rt.color}
          icon={
            <span className="rt-a" style={{ borderBottomColor: st.color }}>
              A
            </span>
          }
          colors={TEXT_COLORS}
          onPick={(c) => style({ color: c })}
          onClear={() => style({ color: null })}
        />
        <Swatches label={L.rt.highlight} icon={<Svg d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />} colors={MARK_COLORS} onPick={(c) => style({ "background-color": c })} onClear={() => style({ "background-color": null })} />
      </Group>
      <Group>
        <Btn label={L.rt.bullets} active={st.block === "bullet"} onClick={() => setBlock("bullet")}>
          <Svg d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
        </Btn>
        <Btn label={L.rt.numbers} active={st.block === "number"} onClick={() => setBlock("number")}>
          <Svg d="M10 6h10M10 12h10M10 18h10M4 4v4M3 8h2M3 12.5a1 1 0 0 1 2 0c0 .8-2 1.5-2 2.5h2M3 17h2v4H3M3 19h2" />
        </Btn>
        <Btn label={L.rt.tasks} active={st.block === "check"} onClick={() => setBlock("check")}>
          <Svg d="M4 5h4v4H4zM4 15h4v4H4zM11 7h9M11 17h9M5 7l1 1 2-2" />
        </Btn>
        <Btn label={L.rt.outdent} onClick={() => editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined)}>
          <Svg d="M21 6H11M21 12h-8M21 18H11M7 9l-3 3 3 3" />
        </Btn>
        <Btn label={L.rt.indent} onClick={() => editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined)}>
          <Svg d="M21 6H11M21 12h-8M21 18H11M4 9l3 3-3 3" />
        </Btn>
      </Group>
      <Group wide>
        {(["left", "center", "right", "justify"] as const).map((a) => (
          <Btn key={a} label={L.rt.align[a]} active={st.align === a || (a === "left" && st.align === "")} onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, a)}>
            <Svg d={ALIGN[a]} />
          </Btn>
        ))}
      </Group>
      <Group>
        <LinkButton active={st.link} onApply={(url) => editor.dispatchCommand(TOGGLE_LINK_COMMAND, url)} />
        <Btn label={L.rt.clear} onClick={clear}>
          <Svg d="M4 7V5h12v2M10 5l-3 14M14 14l6 6M20 14l-6 6" />
        </Btn>
      </Group>
    </div>
  );
}

const ALIGN = {
  left: "M3 6h18M3 12h12M3 18h16",
  center: "M3 6h18M6 12h12M4 18h16",
  right: "M3 6h18M9 12h12M5 18h16",
  justify: "M3 6h18M3 12h18M3 18h18",
};

function Group({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={`rt-group ${wide ? "rt-wide" : ""}`}>{children}</div>;
}

function Svg({ d }: { d: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Btn({ label, keys, active, disabled, onClick, children }: { label: string; keys?: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`rt-btn ${active ? "is-on" : ""}`}
      aria-label={label}
      aria-pressed={active}
      title={keys ? `${label} (${keys})` : label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  return { open, setOpen, box };
}

function Swatches({ label, icon, colors, onPick, onClear }: { label: string; icon: ReactNode; colors: string[]; onPick: (c: string) => void; onClear: () => void }) {
  const { open, setOpen, box } = usePopover();
  return (
    <div className="rt-pop-wrap" ref={box}>
      <Btn label={label} active={open} onClick={() => setOpen((o) => !o)}>
        {icon}
        <span className="rt-caret">▾</span>
      </Btn>
      {open && (
        <div className="rt-pop" role="menu" aria-label={label}>
          <div className="rt-swatches">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                className="rt-swatch"
                style={{ background: c }}
                aria-label={c}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(c);
                  setOpen(false);
                }}
              />
            ))}
          </div>
          <button
            type="button"
            className="rt-pop-clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onClear();
              setOpen(false);
            }}
          >
            {L.rt.noColor}
          </button>
        </div>
      )}
    </div>
  );
}

function LinkButton({ active, onApply }: { active: boolean; onApply: (url: string | null) => void }) {
  const { open, setOpen, box } = usePopover();
  const [url, setUrl] = useState("");
  const apply = () => {
    const u = url.trim();
    onApply(u ? (/^(https?:|mailto:)/i.test(u) ? u : `https://${u}`) : null);
    setOpen(false);
  };
  return (
    <div className="rt-pop-wrap" ref={box}>
      <Btn
        label={L.rt.link}
        active={active || open}
        onClick={() => {
          setUrl("");
          setOpen((o) => !o);
        }}
      >
        <Svg d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
      </Btn>
      {open && (
        <div className="rt-pop rt-link-pop">
          <label className="sr-only" htmlFor="rt-link">
            {L.rt.link}
          </label>
          <input
            id="rt-link"
            autoFocus
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") apply();
              if (e.key === "Escape") setOpen(false);
            }}
          />
          <button type="button" className="btn btn-primary small" onClick={apply}>
            {active && !url.trim() ? L.rt.linkRemove : L.rt.linkApply}
          </button>
        </div>
      )}
    </div>
  );
}
