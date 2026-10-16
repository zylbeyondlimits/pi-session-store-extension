import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const createJiti = require("jiti");
const jiti = createJiti(import.meta.url, { interopDefault: true });
const extensionModule = jiti(new URL("../extensions/store-session.ts", import.meta.url).pathname);
const extensionFactory = extensionModule.default ?? extensionModule;

function createCommandRuntime({ sessionFile } = {}) {
	let command;
	let renamedTo;
	const notifications = [];

	const pi = {
		registerCommand(name, options) {
			if (name === "store") command = options.handler;
		},
		getSettings() {
			return {};
		},
		setSessionName(name) {
			renamedTo = name;
		},
	};

	extensionFactory(pi);

	return {
		command,
		named: () => renamedTo,
		notifications,
		createContext(overrides = {}) {
			const cwd = overrides.cwd ?? "/tmp/pi-session-store-test-project";
			const context = {
				cwd,
				ui: {
					notify(message, level) {
						notifications.push({ message, level });
					},
				},
				waitForIdle: async () => {},
				sessionManager: {
					getSessionFile: () => sessionFile,
					getSessionDir: () => "",
					getSessionId: () => "test-session-id",
					getHeader: () => ({
						type: "session",
						version: 3,
						id: "test-session-id",
						timestamp: "2026-01-01T00:00:00.000Z",
						cwd,
					}),
					getBranch: () => [
						{
							type: "message",
							id: "entry-1",
							parentId: null,
							timestamp: "2026-01-01T00:00:01.000Z",
							message: { role: "user", content: "hello", timestamp: 1 },
						},
						{
							type: "message",
							id: "entry-2",
							parentId: "entry-1",
							timestamp: "2026-01-01T00:00:02.000Z",
							message: { role: "assistant", content: "hi", timestamp: 2 },
						},
					],
				},
				switchSession: async (sessionPath, options) => {
					await options.withSession({
						ui: {
							notify(message, level) {
								notifications.push({ message, level });
							},
						},
					});
					return { cancelled: false, sessionPath };
				},
				...overrides,
			};
			return context;
		},
	};
}

test("stores an ephemeral branch as a resumable JSONL session", async () => {
	const sessionDir = await mkdtemp(join(tmpdir(), "pi-session-store-"));
	const previousDir = process.env.PI_CODING_AGENT_SESSION_DIR;
	process.env.PI_CODING_AGENT_SESSION_DIR = sessionDir;

	try {
		const runtime = createCommandRuntime();
		await runtime.command("research notes", runtime.createContext());

		assert.equal(runtime.named(), "research notes");
		const files = (await readdir(sessionDir)).filter((file) => file.endsWith(".jsonl"));
		assert.equal(files.length, 1);

		const lines = (await readFile(join(sessionDir, files[0]), "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));

		assert.equal(lines.length, 3);
		assert.equal(lines[0].type, "session");
		assert.equal(lines[0].version, 3);
		assert.equal(lines[1].parentId, null);
		assert.equal(lines[2].parentId, "entry-1");
		assert.match(runtime.notifications.at(-1).message, /Stored and switched to a persistent session/);
	} finally {
		if (previousDir === undefined) delete process.env.PI_CODING_AGENT_SESSION_DIR;
		else process.env.PI_CODING_AGENT_SESSION_DIR = previousDir;
		await rm(sessionDir, { recursive: true, force: true });
	}
});

test("does not duplicate an existing persistent session", async () => {
	const runtime = createCommandRuntime({ sessionFile: "/tmp/already-persistent.jsonl" });
	await runtime.command("", runtime.createContext());

	assert.equal(runtime.notifications.length, 1);
	assert.match(runtime.notifications[0].message, /already persistent/);
});
