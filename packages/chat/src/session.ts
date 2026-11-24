/**
 * The chat session schema moved to `@hackbuild/converse`. These names are
 * re-exported for one version; import them from `@hackbuild/converse`.
 * @deprecated
 */

export {
  createSession,
  migrateSession,
  importSession,
  exportSession,
  sessionMessages,
  sessionToMarkdown,
  SessionError,
  SESSION_KIND,
  SESSION_VERSION,
  type ChatSession,
  type SessionMessage,
} from "@hackbuild/converse";
