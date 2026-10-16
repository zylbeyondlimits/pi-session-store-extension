import { CURRENT_SESSION_VERSION } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

function expandPath(value: string): string {
	if (value === "~") return homedir();
	if (value.startsWith("~/")) return join(homedir(), value.slice(2));
	return value;
}

function encodeProjectPath(cwd: string): string {
	const encoded = cwd.replace(/^[/\\]+/, "").replace(/[\\/:]/g, "-");
	return `--${encoded}--`;
}

function getSessionDir(pi: ExtensionAPI, cwd: string, activeSessionDir: string): string {
	// A persistent session already knows the exact directory it belongs to.
	if (activeSessionDir) return activeSessionDir;

	const settings = pi.getSettings() as { sessionDir?: string };
	const configured = process.env.PI_CODING_AGENT_SESSION_DIR || settings.sessionDir;
	if (configured) {
		const expanded = expandPath(configured);
		return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
	}

	const agentDir = expandPath(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"));
	return join(agentDir, "sessions", encodeProjectPath(cwd));
}

function serializeCurrentBranch(ctx: ExtensionContext): string {
	const header = ctx.sessionManager.getHeader();
	if (!header) throw new Error("Current session has no valid session header");

	const timestamp = new Date().toISOString();
	const branch = ctx.sessionManager.getBranch();
	const entries = branch.map((entry, index) => ({
		...entry,
		parentId: index === 0 ? null : branch[index - 1].id,
	}));

	return [
		JSON.stringify({ ...header, type: "session", version: CURRENT_SESSION_VERSION, timestamp }),
		...entries.map((entry) => JSON.stringify(entry)),
	].join("\n") + "\n";
}

function createSessionPath(dir: string, sessionId: string): string {
	mkdirSync(dir, { recursive: true });
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const base = `${timestamp}_${sessionId || randomUUID()}`;
	let candidate = join(dir, `${base}.jsonl`);
	let suffix = 1;
	while (existsSync(candidate)) {
		candidate = join(dir, `${base}-${suffix++}.jsonl`);
	}
	return candidate;
}

export default function storeSessionExtension(pi: ExtensionAPI) {
	pi.registerCommand("store", {
		description: "Promote the current ephemeral session to a resumable session; optionally provide a session name",
		handler: async (args, ctx) => {
			await ctx.waitForIdle();

			const name = args.trim();
			if (name) pi.setSessionName(name);

			const existingFile = ctx.sessionManager.getSessionFile();
			if (existingFile) {
				ctx.ui.notify(
					name ? `The current session is already persistent; renamed to: ${name}` : `The current session is already persistent: ${existingFile}`,
					"info",
				);
				return;
			}

			const sessionDir = getSessionDir(pi, ctx.cwd, ctx.sessionManager.getSessionDir());
			const sessionPath = createSessionPath(sessionDir, ctx.sessionManager.getSessionId());
			writeFileSync(sessionPath, serializeCurrentBranch(ctx), { encoding: "utf8", flag: "wx" });

			const result = await ctx.switchSession(sessionPath, {
				withSession: async (next) => {
					next.ui.notify(`Stored and switched to a persistent session: ${sessionPath}`, "info");
				},
			});

			if (result.cancelled) {
				ctx.ui.notify(`The session file was created, but switching was canceled: ${sessionPath}`, "warning");
			}
		},
	});
}
