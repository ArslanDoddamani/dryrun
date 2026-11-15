// Tiny language-agnostic highlighter: good enough for interview-sized Python/JS/Java/C++ snippets.

const KEYWORDS = new Set(
  (
    "def return if elif else for while in not and or is None True False class import from as with try except " +
    "finally raise lambda yield pass break continue global nonlocal function const let var new this null " +
    "undefined true false switch case default do typeof instanceof public private protected static void int " +
    "long double float boolean bool char string String auto vector map set unordered_map struct final extends " +
    "implements interface throws throw catch nullptr template typename using namespace include fn mut impl pub " +
    "match loop func range go package type"
  ).split(" "),
);

export type TokenKind = "kw" | "num" | "str" | "com" | "fn" | "txt";

const TOKEN = /(\/\/.*|#.*)|("(?:\\.|[^"])*"?|'(?:\\.|[^'])*'?|`(?:\\.|[^`])*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)(?=\s*\()|([A-Za-z_]\w*)|(\s+|.)/g;

export function tokenize(line: string): { kind: TokenKind; text: string }[] {
  const out: { kind: TokenKind; text: string }[] = [];
  const push = (kind: TokenKind, text: string) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ kind, text });
  };
  for (const m of line.matchAll(TOKEN)) {
    if (m[1]) push("com", m[1]);
    else if (m[2]) push("str", m[2]);
    else if (m[3]) push("num", m[3]);
    else if (m[4]) push(KEYWORDS.has(m[4]) ? "kw" : "fn", m[4]);
    else if (m[5]) push(KEYWORDS.has(m[5]) ? "kw" : "txt", m[5]);
    else push("txt", m[6]);
  }
  return out;
}

export const TOKEN_COLORS: Record<TokenKind, string> = {
  kw: "#9c36b5",
  num: "#e8590c",
  str: "#2b8a3e",
  com: "#868e96",
  fn: "#1971c2",
  txt: "#212529",
};
