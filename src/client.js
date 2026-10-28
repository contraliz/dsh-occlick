/**
 * `dsh-occlick` — browser half (source).
 *
 * `scripts/build.mjs` replaces the sound-library placeholder below with the
 * OpenCode clips embedded as data URIs, then writes `lib/client.js`. Editing
 * `lib/client.js` by hand is pointless: it is generated.
 */
window.__ModuleLoader__.load({
	id: "dsh-occlick",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");

		/** Browser services this plugin needs. Everything else is optional. */
		const inject = ["sessions", "slots", "locale"];

		/** Dictionary namespace owned by this plugin. */
		const NS = "plugin.occlick";

		/** Stored value that silences a channel. */
		const OFF = "off";

		/** Where the browser remembers each choice. */
		const STORAGE_PREFIX = "dsh-occlick.";

		/** Pre-existing key, kept so an upgrade inherits the chosen turn sound. */
		const LEGACY_KEY = "dsh-occlick.sound";

		/** One entry per event the plugin can sound, with OpenCode's own default. */
		const CHANNELS = [
			{ id: "turn", fallback: "staplebops-01" },
			{ id: "permission", fallback: "staplebops-02" },
			{ id: "error", fallback: "nope-03" },
		];

		/** `[{ id, label, data }]`, filled in by the build. */
		const SOUNDS = __SOUND_LIBRARY__;

		/** Page copy. */
		const en = {
			title: "Sound effects",
			turn: "Turn finished",
			turnHint: "Plays once when an agent turn completes.",
			permission: "Permission requested",
			permissionHint: "Plays when the agent asks you to approve an action.",
			error: "Turn ended on an error",
			errorHint: "Plays instead of the turn-finished sound when a turn fails.",
			off: "Off (silent)",
			preview: "Preview",
			hint: "Choices are saved in this browser. Each dropdown previews as you pick.",
			summary: "Plays a sound when a turn finishes, asks for permission, or fails.",
		};

		const zh = {
			title: "提示音",
			turn: "回合完成",
			turnHint: "智能体回合完成时播放一次。",
			permission: "请求权限",
			permissionHint: "智能体请求你批准某个操作时播放。",
			error: "回合出错结束",
			errorHint: "回合失败时播放，替换「回合完成」提示音。",
			off: "关闭（静音）",
			preview: "试听",
			hint: "选择保存在当前浏览器中；切换选项时会立即试听。",
			summary: "回合完成、请求权限或失败时播放提示音。",
		};

		/**
		 * Resolve one sound by id.
		 * @param id - sound id such as `staplebops-01`.
		 * @param fallback - id used when the requested one is missing.
		 * @returns the sound, always defined for a non-empty library.
		 */
		function findSound(id, fallback) {
			return (
				SOUNDS.find((sound) => sound.id === id) ??
				SOUNDS.find((sound) => sound.id === fallback) ??
				SOUNDS[0]
			);
		}

		/**
		 * Whether a stored id names a shipped sound.
		 * @param id - candidate id.
		 * @returns true for `off` and for shipped sounds.
		 */
		function isChoice(id) {
			return id === OFF || SOUNDS.some((sound) => sound.id === id);
		}

		/**
		 * Read the saved choice for one channel.
		 * @param channel - one entry of {@link CHANNELS}.
		 * @returns a shipped sound id, or `off`.
		 */
		function readChoice(channel) {
			try {
				const saved = window.localStorage.getItem(STORAGE_PREFIX + channel.id);
				if (saved !== null && isChoice(saved)) return saved;
				if (channel.id === "turn") {
					const legacy = window.localStorage.getItem(LEGACY_KEY);
					if (legacy !== null && SOUNDS.some((sound) => sound.id === legacy)) return legacy;
				}
			} catch {
				// Private modes and storage policies can refuse reads.
			}
			return channel.fallback;
		}

		/**
		 * Persist one choice; a refused write only costs the preference.
		 * @param channelId - channel such as `turn`.
		 * @param soundId - the selected sound id, or `off`.
		 */
		function writeChoice(channelId, soundId) {
			try {
				window.localStorage.setItem(STORAGE_PREFIX + channelId, soundId);
			} catch {
				// Keep the current choice even when it cannot be saved.
			}
		}

		/**
		 * Own the one audio element this plugin reuses.
		 * @returns playback controls.
		 */
		function createPlayer() {
			let element;

			/**
			 * Create the element on first use, inside a user gesture when possible.
			 * @returns the element, or undefined when the browser has no audio.
			 */
			function ensure() {
				if (element !== undefined) return element;
				if (typeof window.Audio !== "function") return undefined;
				element = new window.Audio();
				element.preload = "auto";
				return element;
			}

			/**
			 * Play one sound from the start.
			 * @param id - the sound to play; `off` plays nothing.
			 * @param fallback - id used when `id` is unknown.
			 * @returns whether playback was attempted.
			 */
			function play(id, fallback) {
				if (id === OFF) return false;
				const sound = findSound(id, fallback);
				const audio = ensure();
				if (sound === undefined || audio === undefined) return false;
				audio.muted = false;
				try {
					audio.src = sound.data;
					audio.currentTime = 0;
				} catch {
					// A browser that refuses the seek still plays from the start.
				}
				const started = audio.play();
				if (started !== null && typeof started === "object" && typeof started.catch === "function") {
					started.catch(() => {});
				}
				return true;
			}

			/**
			 * Grant media activation once, so a later event is not blocked by the
			 * autoplay policy.
			 */
			function unlock() {
				const audio = ensure();
				if (audio === undefined) return;
				audio.muted = true;
				play(readChoice(CHANNELS[0]), CHANNELS[0].fallback);
				audio.muted = false;
			}

			return { play, unlock };
		}

		/**
		 * Inject the page's small stylesheet once.
		 */
		function installStyles() {
			const tagId = "dsh-occlick/settings.css";
			if (typeof document === "undefined") return;
			if (document.querySelector(`style[data-plugin-css="${tagId}"]`) !== null) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-occlick";
			tag.dataset.pluginCss = tagId;
			tag.textContent = `
.dsh-occlick { display: grid; gap: 14px; padding: 4px 0; }
.dsh-occlick__row { display: grid; gap: 6px; }
.dsh-occlick__label { color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 1.5; }
.dsh-occlick__select { appearance: auto; background: var(--dsw-alias-bg-layer-2, transparent); color: var(--dsw-alias-label-primary, inherit); border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35)); border-radius: 6px; font: inherit; font-size: 13px; max-width: 320px; padding: 6px 8px; }
.dsh-occlick__hint { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 1.5; margin: 0; }
.dsh-occlick__preview { background: transparent; border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35)); border-radius: 6px; color: var(--dsw-alias-label-primary, inherit); cursor: pointer; font: inherit; font-size: 12px; padding: 5px 10px; }
.dsh-occlick__preview:hover { background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.12)); }
.dsh-occlick__preview:disabled { cursor: default; opacity: .45; }
`;
			document.head.appendChild(tag);
		}

		/**
		 * The Plugins page configuration for this bundle's row: one selector per
		 * event channel.
		 * @param props - locale copy, the requested view, and the shared player.
		 * @returns the selectors, or a one-line summary.
		 */
		function SoundSettings(props) {
			const t = props.t;
			const player = props.player;
			const [choices, setChoices] = react.useState(() => {
				const initial = {};
				for (const entry of CHANNELS) initial[entry.id] = readChoice(entry);
				return initial;
			});

			if (props.view === "summary") return t("summary");

			const rows = CHANNELS.map((entry) => {
				const selectId = `dsh-occlick-${entry.id}`;
				const change = (event) => {
					const soundId = event.target.value;
					setChoices((previous) => ({ ...previous, [entry.id]: soundId }));
					writeChoice(entry.id, soundId);
					player.play(soundId, entry.fallback);
				};
				const options = [
					react.createElement("option", { key: OFF, value: OFF }, t("off")),
					...SOUNDS.map((sound) => react.createElement("option", { key: sound.id, value: sound.id }, sound.label)),
				];
				const preview = () => player.play(choices[entry.id], entry.fallback);
				return react.createElement(
					"div",
					{ className: "dsh-occlick__row", key: entry.id },
					react.createElement("label", { className: "dsh-occlick__label", htmlFor: selectId }, t(entry.id)),
					react.createElement(
						"select",
						{ className: "dsh-occlick__select", id: selectId, value: choices[entry.id], onChange: change },
						options,
					),
					react.createElement(
						"button",
						{
							type: "button",
							className: "dsh-occlick__preview",
							id: `${selectId}-preview`,
							disabled: choices[entry.id] === OFF,
							onClick: preview,
						},
						t("preview"),
					),
					react.createElement("p", { className: "dsh-occlick__hint" }, t(`${entry.id}Hint`)),
				);
			});

			return react.createElement(
				"div",
				{ className: "dsh-occlick" },
				rows,
				react.createElement("p", { className: "dsh-occlick__hint" }, t("hint")),
			);
		}

		/**
		 * Client plugin body: one sound per event channel, plus the selectors on the
		 * Plugins page.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { en, zh }), "occlick: dictionaries");
			installStyles();

			const player = createPlayer();
			const channelOf = (id) => CHANNELS.find((entry) => entry.id === id) ?? CHANNELS[0];
			const playChannel = (id) => {
				const entry = channelOf(id);
				return player.play(readChoice(entry), entry.fallback);
			};

			/** Register the settings page first, so an optional signal cannot hide it. */
			ctx.effect(
				() =>
					ctx.slots.inject("plugins.row.config", () =>
						ctx.slots.register(
							{
								name: "plugins.row.config",
								key: "dsh-occlick#occlick",
								locale: NS,
							},
							(props) => SoundSettings({ ...props, player }),
						),
					),
				"occlick: plugin page",
			);

			/** The same pickers as their own page under Settings. */
			ctx.effect(
				() =>
					ctx.slots.inject("settings.section", () =>
						ctx.slots.register(
							{
								name: "settings.section",
								id: "occlick",
								order: 50,
								label: () => t("title"),
								locale: NS,
							},
							(props) => SoundSettings({ ...props, view: "page", player }),
						),
					),
				"occlick: settings page",
			);

			/** Unlock media playback on the first interaction the page receives. */
			ctx.effect(() => {
				const unlock = () => player.unlock();
				window.addEventListener("pointerdown", unlock, { capture: true, once: true });
				window.addEventListener("keydown", unlock, { capture: true, once: true });
				return () => {
					window.removeEventListener("pointerdown", unlock, { capture: true });
					window.removeEventListener("keydown", unlock, { capture: true });
				};
			}, "occlick: media activation");

			/** Sessions that reported an error recently, so a failed turn sounds once. */
			const errored = new Map();
			const ERROR_WINDOW_MS = 15000;

			/** Approval requests can arrive in bursts; one sound per burst is enough. */
			let lastApprovalAt = 0;
			const APPROVAL_GAP_MS = 1500;
			/** Pending interactions already announced, so repeated evaluation is silent. */
			const announced = new WeakSet();

			const noteApproval = (token) => {
				if (token !== undefined && token !== null && typeof token === "object") {
					if (announced.has(token)) return;
					announced.add(token);
				}
				const now = Date.now();
				if (now - lastApprovalAt < APPROVAL_GAP_MS) return;
				lastApprovalAt = now;
				playChannel("permission");
			};

			/** Optional signals: none of them may break the page above. */
			const remote = typeof ctx.get === "function" ? ctx.get("remote") : undefined;
			const onRemote = (event, handler, label) => {
				if (remote === undefined || remote === null || typeof remote.$on !== "function") return;
				try {
					const dispose = remote.$on(event, handler);
					ctx.effect(() => dispose, label);
				} catch (error) {
					// An unregistered event or a stricter host must not take the plugin down.
					console.warn(`[dsh-occlick] could not observe ${event}:`, error);
				}
			};

			onRemote(
				"approval/request",
				function (request, next) {
					noteApproval(request);
					return typeof next === "function" ? next() : undefined;
				},
				"occlick: permission requests",
			);

			onRemote(
				"api-session/error",
				(sessionId) => {
					errored.set(sessionId, Date.now());
					playChannel("error");
				},
				"occlick: session errors",
			);

			/**
			 * Order-independent fallback: the composer chain is evaluated whenever a
			 * pending interaction appears, and returning null leaves the approval
			 * panel's own entry to win.
			 */
			ctx.effect(
				() =>
					ctx.slots.inject("conversation.composer", () =>
						ctx.slots.register(
							{
								name: "conversation.composer",
								priority: 0,
								locale: NS,
								select: ({ pendingInteraction }) => {
									if (pendingInteraction === undefined || pendingInteraction === null) return null;
									noteApproval(pendingInteraction);
									return null;
								},
							},
							() => null,
						),
					),
				"occlick: pending interactions",
			);

			const sessions = ctx.sessions;
			const list = sessions === null || sessions === undefined ? undefined : sessions.list;
			if (list !== undefined && list !== null && typeof list.subscribe === "function") {
				/** Last observed running bit, so only a true-to-false edge clicks. */
				const previous = new Map();
				const observe = () => {
					const snapshot = list.getSnapshot();
					if (snapshot === null || snapshot === undefined) return;
					const byId = snapshot.byId ?? {};
					const ids = Array.isArray(snapshot.ids) ? snapshot.ids : Object.keys(byId);
					const live = new Set();
					for (const id of ids) {
						const row = byId[id];
						if (row === null || row === undefined) continue;
						live.add(id);
						const running = row.running === true;
						const wasRunning = previous.get(id);
						previous.set(id, running);
						if (wasRunning !== true || running) continue;
						if (row.origin === "subagent") continue;
						const failedAt = errored.get(id);
						if (failedAt !== undefined && Date.now() - failedAt < ERROR_WINDOW_MS) {
							// The error channel already sounded; do not double up.
							errored.delete(id);
							continue;
						}
						playChannel("turn");
					}
					for (const id of previous.keys()) if (!live.has(id)) previous.delete(id);
				};
				ctx.effect(() => list.subscribe(observe), "occlick: turn ends");
				observe();
			} else {
				console.warn("[dsh-occlick] the client Session list is unavailable; no turn-end sound will play");
			}
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
