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

		/** Browser services this plugin needs. */
		const inject = ["sessions", "slots", "locale"];

		/** Dictionary namespace owned by this plugin. */
		const NS = "plugin.occlick";

		/** Where the browser remembers the chosen sound. */
		const STORAGE_KEY = "dsh-occlick.sound";

		/** The OpenCode clip OpenCode itself uses for a finished turn. */
		const DEFAULT_SOUND = "staplebops-01";

		/** `[{ id, label, data }]`, filled in by the build. */
		const SOUNDS = __SOUND_LIBRARY__;

		/** Page copy. */
		const en = {
			title: "Turn sound",
			sound: "End-of-turn sound",
			hint: "Plays once when an agent turn finishes. Choose any sound from the OpenCode library; it is saved in this browser.",
			summary: "Plays a chime when an agent turn finishes.",
			preview: "Preview",
			missing: "This browser cannot play audio.",
		};

		const zh = {
			title: "回合提示音",
			sound: "回合结束提示音",
			hint: "智能体回合结束时播放一次。可选任意 OpenCode 音效，保存在当前浏览器中。",
			summary: "智能体回合结束时播放提示音。",
			preview: "试听",
			missing: "当前浏览器无法播放音频。",
		};

		/**
		 * Resolve one sound by id.
		 * @param id - sound id such as `staplebops-01`.
		 * @returns the sound, or the default when the id is unknown.
		 */
		function findSound(id) {
			return SOUNDS.find((sound) => sound.id === id) ?? SOUNDS.find((sound) => sound.id === DEFAULT_SOUND) ?? SOUNDS[0];
		}

		/**
		 * Read the saved choice, falling back to the default.
		 * @returns a sound id this build ships.
		 */
		function readSelection() {
			try {
				const saved = window.localStorage.getItem(STORAGE_KEY);
				if (saved !== null && SOUNDS.some((sound) => sound.id === saved)) return saved;
			} catch {
				// Private modes and storage policies can refuse reads.
			}
			return DEFAULT_SOUND;
		}

		/**
		 * Persist the choice; a refused write only costs the preference.
		 * @param id - the selected sound id.
		 */
		function writeSelection(id) {
			try {
				window.localStorage.setItem(STORAGE_KEY, id);
			} catch {
				// Keep playing the current choice even when it cannot be saved.
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
			 * @param id - the sound to play.
			 * @returns whether playback was attempted.
			 */
			function play(id) {
				const sound = findSound(id);
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
			 * Grant media activation once, so a later turn-end click is not blocked
			 * by the autoplay policy.
			 */
			function unlock() {
				const audio = ensure();
				if (audio === undefined) return;
				audio.muted = true;
				play(readSelection());
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
.dsh-occlick { display: grid; gap: 8px; padding: 4px 0; }
.dsh-occlick__label { color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 1.5; }
.dsh-occlick__select { appearance: auto; background: var(--dsw-alias-bg-layer-2, transparent); color: var(--dsw-alias-label-primary, inherit); border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35)); border-radius: 6px; font: inherit; font-size: 13px; max-width: 320px; padding: 6px 8px; }
.dsh-occlick__hint { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 1.5; margin: 0; }
`;
			document.head.appendChild(tag);
		}

		/**
		 * The Plugins page configuration for this bundle's row.
		 * @param props - locale copy, the requested view, and the shared player.
		 * @returns the selector, or a one-line summary.
		 */
		function TurnSoundSettings(props) {
			const t = props.t;
			const player = props.player;
			const [selected, setSelected] = react.useState(readSelection);

			if (props.view === "summary") return t("summary");

			const change = (event) => {
				const id = event.target.value;
				setSelected(id);
				writeSelection(id);
				player.play(id);
			};

			return react.createElement(
				"div",
				{ className: "dsh-occlick" },
				react.createElement("label", { className: "dsh-occlick__label", htmlFor: "dsh-occlick-sound" }, t("sound")),
				react.createElement(
					"select",
					{ className: "dsh-occlick__select", id: "dsh-occlick-sound", value: selected, onChange: change },
					SOUNDS.map((sound) => react.createElement("option", { key: sound.id, value: sound.id }, sound.label)),
				),
				react.createElement("p", { className: "dsh-occlick__hint" }, t("hint")),
			);
		}

		/**
		 * Client plugin body: play the chosen sound at each turn end and expose the
		 * selector on the Plugins page.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { en, zh }), "occlick: dictionaries");
			installStyles();

			const player = createPlayer();

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
						player.play(readSelection());
					}
					for (const id of previous.keys()) if (!live.has(id)) previous.delete(id);
				};
				ctx.effect(() => list.subscribe(observe), "occlick: turn ends");
				observe();
			} else {
				console.warn("[dsh-occlick] the client Session list is unavailable; no turn-end sound will play");
			}

			ctx.effect(
				() =>
					ctx.slots.inject("plugins.row.config", () =>
						ctx.slots.register(
							{
								name: "plugins.row.config",
								key: "dsh-occlick#occlick",
								locale: NS,
							},
							(props) => TurnSoundSettings({ ...props, player }),
						),
					),
				"occlick: settings page",
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
