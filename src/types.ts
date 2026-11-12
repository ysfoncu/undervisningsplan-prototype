/** A user's role in the organization (shown as a tag). */
export type Role = "student" | "veileder" | "medstudent";

export interface User {
  id: string;
  name: string;
  role: Role;
  color: string;
}

/** What an invited person may do with one plan. Chosen by the owner. */
export type Access = "leser" | "redaktor" | "observator";

/** The fixed "Om timen" block. No comments here. */
export interface PlanInfo {
  title: string;
  className: string;
  subject: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  /** Optional video meeting (Zoom, Teams, Meet …), e.g. for remote observers. */
  meetingUrl?: string;
}

export type AnnotationType = "highlight" | "strikeout" | "text";

/**
 * A mark on the live plan text. The anchor is a Lexical MarkNode with this id
 * inside the shared document, so it moves with everyone's edits; this record
 * holds what the mark means. "text" = replace the marked text with `note`.
 */
export interface Annotation {
  id: string;
  type: AnnotationType;
  /** The marked text when it was created (shown on the card). */
  selectedText: string;
  note: string;
  authorId: string;
  createdAt: string;
  /** Accepted = the change was made in the text; dismissed = mark removed, text unchanged. */
  outcome: "accepted" | "dismissed" | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

/**
 * Free-text comment in the right-hand feed, as in the inspiration repo's
 * "Annotations & comments" panel. Belongs to the plan as a whole.
 */
export interface PlanComment {
  id: string;
  authorId: string;
  text: string;
  createdAt: string;
  editedAt: string | null;
}

export interface Participant {
  userId: string;
  access: Access;
  invitedAt: string;
  seenAt: string | null;
}

export type NoteKind = "styrke" | "forslag" | "sporsmal";

/**
 * A photo or video attached to an observation note. The file is stored
 * separately (media.ts); `consent` records who confirmed that pupils have
 * consented or cannot be recognised, and when.
 */
export interface MediaRef {
  id: string;
  kind: "image" | "video";
  name: string;
  size: number;
  consent: { by: string; at: string };
}

export interface Note {
  id: string;
  kind: NoteKind;
  offsetSec: number;
  text: string;
  media?: MediaRef[];
  /** Set when the observer changed the note after writing it. */
  editedAt?: string;
  /** Quick reactions: emoji → ids of the people who chose it. */
  reactions?: Record<string, string[]>;
  /** Comments from anyone in the plan, e.g. the student answering the observer. */
  replies?: Reply[];
}

export interface Observation {
  observerId: string;
  startedAt: string;
  endedAt: string | null;
  notes: Note[];
}

export interface Reply {
  id: string;
  authorId: string;
  text: string;
  at: string;
}

export interface Summary {
  authorId: string;
  feedback: string;
  nextSteps: string;
  sharedAt: string | null;
  replies: Reply[];
}

export type Phase = "plan" | "observe" | "done";

/** Append-only history entry. `text` is already human-readable. */
export interface LogEntry {
  at: string;
  text: string;
}

export interface Plan {
  id: string;
  ownerId: string;
  phase: Phase;
  info: PlanInfo;
  /**
   * Plain-text snapshot of the live document, refreshed while people edit.
   * Used for "does the plan have text yet" and lists. The document itself is
   * a shared Yjs doc (see collab.ts).
   */
  body: string;
  /** People who have edited the text (for the history log). */
  editedBy: string[];
  /** Open annotations, mirrored from the shared doc for lists ("3 åpne markeringer"). */
  openCount: number;
  comments: PlanComment[];
  participants: Participant[];
  observations: Observation[];
  summary: Summary | null;
  log: LogEntry[];
  createdAt: string;
  updatedAt: string;
  doneAt: string | null;
  /** The student's closing comment, written when marking the plan as completed. */
  finalNote?: { text: string; at: string } | null;
}

export interface Group {
  id: string;
  name: string;
  school: string;
  memberIds: string[];
}

export interface State {
  users: User[];
  group: Group;
  plans: Plan[];
}
