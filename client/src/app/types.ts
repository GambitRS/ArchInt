export type User = { id: number; name: string; email: string; role: "admin" | "user" };
export type Screen = "login" | "library" | "editor";
export type SaveIssueKind = "conflict" | "session" | "network" | "error";
export type SaveIssue = { kind: SaveIssueKind; message: string };
export type Template = "blank" | "architecture";
