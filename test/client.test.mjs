/**
 * Offline checks for the generated browser half.
 *
 * The bundle is a side-effecting script for `window.__ModuleLoader__`, so the
 * harness installs a fake browser plus a two-function React stand-in, imports
 * the bundle once, and drives `apply` directly.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

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

/** Two-function React stand-in: enough for the selector. */
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
 * @param options - the session list to observe.
 * @returns the mounted context and captured slot registrations.
 */
function mount({ list = createList() } = {}) {
	const plugin = materialize();
	const disposers = [];
	const registrations = [];
	const ctx = {
		sessions: { list },
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
		dispose() {
			for (const dispose of disposers.splice(0)) dispose();
		},
	};
}

test("registers one module and asks for the services it uses", () => {
	assert.equal(registration.id, "dsh-occlick");
	const plugin = materialize();
	assert.equal(typeof plugin.apply, "function");
	assert.deepEqual(plugin.inject, ["sessions", "slots", "locale"]);
});

test("plays the default sound when a running turn ends", () => {
	played.length = 0;
	const mounted = mount();
	mounted.list.publish({ a: { running: true } });
	assert.equal(played.length, 0, "starting a turn is silent");
	mounted.list.publish({ a: { running: false } });
	assert.equal(played.length, 1, "the turn end plays once");
	mounted.dispose();
});

test("stays silent for repeated idle snapshots and subagent turns", () => {
	played.length = 0;
	const mounted = mount();
	mounted.list.publish({ a: { running: true } });
	mounted.list.publish({ a: { running: false } });
	mounted.list.publish({ a: { running: false } });
	assert.equal(played.length, 1, "only the falling edge plays");

	mounted.list.publish({ child: { running: true, origin: "subagent" } });
	mounted.list.publish({ child: { running: false, origin: "subagent" } });
	assert.equal(played.length, 1, "subagent turns stay quiet");
	mounted.dispose();
});

test("uses the sound saved in this browser", () => {
	played.length = 0;
	storage.set("dsh-occlick.sound", "yup-02");
	const mounted = mount();
	mounted.list.publish({ a: { running: true } });
	mounted.list.publish({ a: { running: false } });
	assert.equal(played.length, 1);
	assert.match(played[0].src, /^data:audio\/mpeg;base64,/);
	storage.clear();
	mounted.dispose();
});

test("registers the configuration page for its own row", () => {
	const mounted = mount();
	const entry = mounted.registrations.find((item) => item.options.name === "plugins.row.config");
	assert.ok(entry, "the row configuration slot is registered");
	assert.equal(entry.options.key, "dsh-occlick#occlick");
	assert.equal(entry.options.locale, "plugin.occlick");
	mounted.dispose();
});

test("the page renders every sound and persists a new choice", () => {
	played.length = 0;
	storage.clear();
	const mounted = mount();
	const entry = mounted.registrations.find((item) => item.options.name === "plugins.row.config");

	const summary = entry.component({ t: (key) => key, view: "summary" });
	assert.equal(summary, "summary", "the one-line view returns copy, not a form");

	const view = entry.component({ t: (key) => key, view: "page" });
	const select = view.props.children.find((child) => child.type === "select");
	assert.equal(select.props.children.length, 45, "all 45 OpenCode sounds are offered");
	assert.equal(select.props.value, "staplebops-01", "the default matches OpenCode's own turn-end sound");

	const before = played.length;
	select.props.onChange({ target: { value: "nope-03" } });
	assert.equal(storage.get("dsh-occlick.sound"), "nope-03");
	assert.equal(played.length, before + 1, "choosing previews the sound");
	assert.match(played.at(-1).src, /^data:audio\/mpeg;base64,/);
	mounted.dispose();
});

test("labels match the OpenCode picker", () => {
	const mounted = mount();
	const entry = mounted.registrations.find((item) => item.options.name === "plugins.row.config");
	const view = entry.component({ t: (key) => key, view: "page" });
	const select = view.props.children.find((child) => child.type === "select");
	const labels = select.props.children.map((option) => option.props.children[0]);
	assert.ok(labels.includes("Staplebops 01"), "Staplebops 01 is present");
	assert.ok(labels.includes("Bip-bop 06"), "Bip-bop 06 is present");
	assert.ok(labels.includes("Nope 12"), "Nope 12 is present");
	assert.ok(labels.includes("Yup 06"), "Yup 06 is present");
	assert.equal(labels.length, 45);
	mounted.dispose();
});
