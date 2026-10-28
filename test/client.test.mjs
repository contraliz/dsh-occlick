/**
 * Offline checks for the generated browser half.
 *
 * The bundle is a side-effecting script for `window.__ModuleLoader__`, so the
 * harness installs a fake browser plus a two-function React stand-in, imports
 * the bundle once, and drives `apply` directly.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("the package manifest parses strictly", () => {
	const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
	// A byte-order mark breaks the Host's JSON parse, which is how DSH reports
	// "Package unavailable"; JSON.parse rejects it, so this catches a bad write.
	const manifest = JSON.parse(raw);
	assert.equal(manifest.name, "dsh-occlick");
	assert.equal(manifest.dsh.bundle.patch, "./cordis.patch.yml");
	assert.equal(manifest.dsh.client.platform, "web");
	assert.ok(manifest.files.includes("lib"), "the built client must ship");
});

/** Playback calls observed by the fake audio element. */
const played = [];

class FakeAudio {
	constructor() {
		this.muted = false;
		this.preload = "";
		this.src = "";
		this.currentTime = 0;
	}
	play() {
		played.push({ src: this.src, muted: this.muted });
		return Promise.resolve();
	}
}

const storage = new Map();

const fakeWindow = {
	Audio: FakeAudio,
	localStorage: {
		getItem: (key) => (storage.has(key) ? storage.get(key) : null),
		setItem: (key, value) => storage.set(key, value),
	},
	addEventListener() {},
	removeEventListener() {},
};

globalThis.window = fakeWindow;
globalThis.document = {
	querySelector: () => null,
	createElement: () => ({ dataset: {}, textContent: "" }),
	head: { appendChild() {} },
};

/** Registration captured from the bundle's module-loader call. */
let registration;

fakeWindow.__ModuleLoader__ = {
	load(entry) {
		registration = entry;
	},
};

/** Two-function React stand-in: enough for the selectors. */
const react = {
	createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
	useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
};

function materialize() {
	return registration.factory((request) => {
		if (request === "react") return react;
		throw new Error(`unexpected module request: ${request}`);
	});
}

await import("../lib/client.js");
assert.ok(registration, "the bundle must register with window.__ModuleLoader__");

/**
 * Snapshot store stand-in for `ctx.sessions.list`.
 * @returns the store and a publish helper.
 */
function createList() {
	const listeners = new Set();
	let snapshot = { ids: [], byId: {}, phase: "ready" };
	return {
		getSnapshot: () => snapshot,
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		publish(rows) {
			const byId = {};
			for (const [id, row] of Object.entries(rows)) byId[id] = { id, blank: false, updatedAt: 0, ...row };
			snapshot = { ids: Object.keys(byId), byId, phase: "ready" };
			for (const listener of [...listeners]) listener();
		},
	};
}

/**
 * Mount the plugin against a fake client context.
 * @param options - the session list to observe and how the remote service behaves.
 * @returns the mounted context, registrations, event handlers, and services.
 */
function mount({ list = createList(), remoteThrows = false, withRemote = true } = {}) {
	const plugin = materialize();
	const disposers = [];
	const registrations = [];
	const handlers = new Map();
	const remote = {
		$on(event, handler) {
			if (remoteThrows) throw new Error("unknown remote event");
			handlers.set(event, handler);
			return () => handlers.delete(event);
		},
	};
	const services = new Map([
		["sessions", { list }],
		["remote", remote],
	]);
	const ctx = {
		sessions: { list },
		get(name) {
			return withRemote ? services.get(name) : undefined;
		},
		locale: {
			bind: () => (key) => key,
			register: () => {},
		},
		slots: {
			inject: (name, callback) => (callback(), () => {}),
			register: (options, component) => {
				registrations.push({ options, component });
				return () => {};
			},
		},
		effect(callback) {
			const dispose = callback();
			if (typeof dispose === "function") disposers.push(dispose);
		},
	};
	plugin.apply(ctx);
	return {
		list,
		registrations,
		handlers,
		dispose() {
			for (const dispose of disposers.splice(0)) dispose();
		},
	};
}

/** Find the row configuration registration. */
function pageOf(mounted) {
	return mounted.registrations.find((item) => item.options.name === "plugins.row.config");
}

/** Read the three selects out of the rendered settings page. */
function selectsOf(mounted) {
	const view = pageOf(mounted).component({ t: (key) => key, view: "page" });
	const rows = view.props.children.filter((child) => child.type === "div");
	return rows.map((row) => row.props.children.find((child) => child.type === "select"));
}

test("registers one module and needs only the stable services", () => {
	assert.equal(registration.id, "dsh-occlick");
	const plugin = materialize();
	assert.equal(typeof plugin.apply, "function");
	assert.deepEqual(plugin.inject, ["sessions", "slots", "locale"], "optional signals must not gate mounting");
});

test("plays the turn channel when a running turn ends", () => {
	played.length = 0;
	const mounted = mount();
	mounted.list.publish({ a: { running: true } });
	assert.equal(played.length, 0, "starting a turn is silent");
	mounted.list.publish({ a: { running: false } });
	assert.equal(played.length, 1, "the turn end plays once");
	mounted.list.publish({ a: { running: false } });
	assert.equal(played.length, 1, "only the falling edge plays");
	mounted.dispose();
});

test("stays quiet for subagent turns", () => {
	played.length = 0;
	const mounted = mount();
	mounted.list.publish({ child: { running: true, origin: "subagent" } });
	mounted.list.publish({ child: { running: false, origin: "subagent" } });
	assert.equal(played.length, 0);
	mounted.dispose();
});

test("plays the permission channel on an approval request and delegates", () => {
	played.length = 0;
	const mounted = mount();
	const handler = mounted.handlers.get("approval/request");
	assert.ok(handler, "the approval waterfall is observed");

	let delegated = false;
	handler.call({}, { toolName: "bash" }, () => {
		delegated = true;
	});
	assert.equal(played.length, 1, "the approval sound plays immediately");
	assert.equal(delegated, true, "the request is passed on to the approval UI");
	mounted.dispose();
});

test("coalesces a burst of approval requests", () => {
	played.length = 0;
	const mounted = mount();
	const handler = mounted.handlers.get("approval/request");
	handler.call({}, { toolName: "bash" }, () => {});
	handler.call({}, { toolName: "bash" }, () => {});
	assert.equal(played.length, 1, "one sound per burst");
	mounted.dispose();
});

test("the composer chain announces a pending interaction without taking it over", () => {
	played.length = 0;
	const mounted = mount();
	const entry = mounted.registrations.find((item) => item.options.name === "conversation.composer");
	assert.ok(entry, "the fallback observer is registered");
	assert.equal(entry.options.priority, 0, "it runs before the approval panel's own entry");
	assert.equal(entry.component({}), null, "it never renders");

	const interaction = { kind: "approval" };
	assert.equal(entry.options.select({ pendingInteraction: interaction }), null, "the chain continues");
	assert.equal(played.length, 1, "the approval sound plays");
	assert.equal(entry.options.select({ pendingInteraction: interaction }), null);
	assert.equal(played.length, 1, "the same interaction does not sound twice");
	mounted.dispose();
});

test("plays the error channel and suppresses the turn-end sound", () => {
	played.length = 0;
	storage.clear();
	const mounted = mount();
	const onError = mounted.handlers.get("api-session/error");
	assert.ok(onError, "session errors are observed");

	mounted.list.publish({ a: { running: true } });
	onError("a", "boom");
	assert.equal(played.length, 1, "the error sound plays when the error arrives");

	mounted.list.publish({ a: { running: false } });
	assert.equal(played.length, 1, "the failed turn does not also play the turn-end sound");
	mounted.dispose();
});

test("a later clean turn plays the turn-end sound again", () => {
	played.length = 0;
	storage.clear();
	const mounted = mount();
	const onError = mounted.handlers.get("api-session/error");

	mounted.list.publish({ a: { running: true } });
	onError("a", "boom");
	mounted.list.publish({ a: { running: false } });

	mounted.list.publish({ a: { running: true } });
	mounted.list.publish({ a: { running: false } });
	assert.equal(played.length, 2, "the error marker is consumed once");
	mounted.dispose();
});

test("still offers the page when the remote service refuses every event", () => {
	const mounted = mount({ remoteThrows: true });
	assert.ok(pageOf(mounted), "the settings page survives a failing subscription");
	assert.equal(selectsOf(mounted).length, 3);
	mounted.dispose();
});

test("still offers the page when the remote service is missing entirely", () => {
	const mounted = mount({ withRemote: false });
	assert.ok(pageOf(mounted));
	mounted.dispose();
});

test("registers the configuration page for its own row", () => {
	const mounted = mount();
	const entry = pageOf(mounted);
	assert.ok(entry);
	assert.equal(entry.options.key, "dsh-occlick#occlick");
	assert.equal(entry.options.locale, "plugin.occlick");
	assert.equal(entry.component({ t: (key) => key, view: "summary" }), "summary");
	mounted.dispose();
});

test("registers the same pickers as a Settings section", () => {
	const mounted = mount();
	const section = mounted.registrations.find((item) => item.options.name === "settings.section");
	assert.ok(section, "Settings carries a Sound effects page");
	assert.equal(section.options.id, "occlick");
	assert.equal(section.options.order, 50);
	assert.equal(section.options.label(), "title");

	const view = section.component({ t: (key) => key, close: () => {} });
	const selects = view.props.children.filter((child) => child.type === "div");
	assert.equal(selects.length, 3, "the section renders all three pickers");
	mounted.dispose();
});

test("renders one selector per channel with OpenCode's defaults", () => {
	storage.clear();
	const mounted = mount();
	const selects = selectsOf(mounted);
	assert.equal(selects.length, 3, "turn, permission, and error");
	assert.deepEqual(
		selects.map((select) => select.props.value),
		["staplebops-01", "staplebops-02", "nope-03"],
	);
	for (const select of selects) {
		assert.equal(select.props.children.length, 46, "45 sounds plus Off");
		assert.equal(select.props.children[0].props.value, "off", "Off comes first");
	}
	mounted.dispose();
});

test("saving one channel previews it and leaves the others alone", () => {
	storage.clear();
	played.length = 0;
	const mounted = mount();
	const [, permission] = selectsOf(mounted);
	const before = played.length;
	permission.props.onChange({ target: { value: "yup-02" } });
	assert.equal(storage.get("dsh-occlick.permission"), "yup-02");
	assert.equal(played.length, before + 1, "the new choice previews");
	assert.equal(storage.has("dsh-occlick.turn"), false, "other channels are untouched");
	mounted.dispose();
});

test("choosing Off silences the channel", () => {
	storage.clear();
	played.length = 0;
	const mounted = mount();
	const [turn] = selectsOf(mounted);
	const before = played.length;
	turn.props.onChange({ target: { value: "off" } });
	assert.equal(storage.get("dsh-occlick.turn"), "off");
	assert.equal(played.length, before, "Off previews nothing");

	mounted.list.publish({ a: { running: true } });
	mounted.list.publish({ a: { running: false } });
	assert.equal(played.length, before, "a silenced channel plays nothing at turn end");
	mounted.dispose();
});

test("inherits a choice saved by the previous single-channel version", () => {
	storage.clear();
	storage.set("dsh-occlick.sound", "nope-05");
	const mounted = mount();
	const [turn] = selectsOf(mounted);
	assert.equal(turn.props.value, "nope-05");
	mounted.dispose();
});
