# dsh-occlick

**Plays OpenCode notification sounds in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)** — one per event, each with its own picker from the whole OpenCode sound library.

OpenCode ships a small library of notification clips for its desktop app. This plugin brings that library to DSH and plays one when a turn finishes, when the agent asks for permission, and when a turn fails, so you can look away while a long task runs.

- **Three channels, three pickers**: turn finished, permission requested, and turn ended on an error each choose their own clip.
- **One click per event**: sounds follow the event, not every step, tool call, or streamed token. A failed turn plays the error clip instead of the turn-finished clip, never both.
- **45 sounds each**: everything OpenCode ships — Alert, Bip-bop, Nope, Staplebops, and Yup — with an instant preview as you choose.
- **Configured in DSH**: the pickers live on the **Plugins** page, on the plugin's own row, so they follow the same enable/disable and uninstall flow as any other bundle.
- **Quiet where it should be**: subagent turns stay silent, and a burst of simultaneous endings or approval requests plays once.

## What it does

| Event | Source | Behaviour |
| --- | --- | --- |
| Turn finished | Session `running: true → false` | Plays the turn clip once |
| Permission requested | `approval/request` | Plays the permission clip, then passes the request to the approval UI |
| Turn ended on an error | `api-session/error` | Plays the error clip; the following turn end stays silent |
| Repeated idle refresh | `false → false` | Silent |
| Subagent Session | `origin: subagent` | Silent |
| Mounted over an idle list | — | Silent (no history replay) |

Because DSH publishes running state per Session, a turn that ends in the background still makes the sound. An error is remembered per Session for 15 seconds, so the failed turn does not also play the turn-finished clip. Approval requests are coalesced within 1.5 seconds, so a burst sounds once.

## Install

Requires DSH `0.2.0` or later.

### Install from DSH

1. Open **Plugins → Add plugin**.
2. Enter the repository address:

   ```text
   https://github.com/contraliz/dsh-occlick
   ```

3. Click **Install**, then **Enable now**.
4. Open **Plugins → dsh-occlick → Configure** and choose a sound.

### Install from the command line

```sh
dsh plugin --profile web add "git+https://github.com/contraliz/dsh-occlick.git"
```

Web and Headless use separate profiles; install it in each profile you want it in. Restart `dsh web` after command-line installation.

### Install from a checkout

```sh
git clone https://github.com/contraliz/dsh-occlick
cd dsh-occlick
dsh plugin --profile web add .
```

## Choose the sounds

Open **Settings → Sound effects**, or **Plugins → dsh-occlick → Configure**. Both show the same three selectors, each listing every clip and labelled the way OpenCode labels them.

Every channel also offers **Off (silent)**, so one event can be muted while the others keep sounding.

The defaults are the clips OpenCode's own desktop app uses for the same events:

| Channel | Default | OpenCode equivalent |
| --- | --- | --- |
| Turn finished | `staplebops-01` | Agent complete |
| Permission requested | `staplebops-02` | Permission required |
| Turn ended on an error | `nope-03` | Error |

Choosing a sound saves it and plays it immediately, so you can audition without waiting for an event.

| Family | Count | Library names |
| --- | --- | --- |
| Alert | 10 | `alert-01` … `alert-10` |
| Bip-bop | 10 | `bip-bop-01` … `bip-bop-10` |
| Nope | 12 | `nope-01` … `nope-12` |
| Staplebops | 7 | `staplebops-01` … `staplebops-07` |
| Yup | 6 | `yup-01` … `yup-06` |

The choices are stored in the browser under `dsh-occlick.turn`, `dsh-occlick.permission`, and `dsh-occlick.error`, so they are per browser rather than per profile. A turn sound saved by version `0.2.x` (`dsh-occlick.sound`) is carried over. Clearing site data restores the defaults.

## Details

- **Audio, not notifications**: the plugin plays a clip through one reused `HTMLAudioElement`. It opens no system notification and registers no service.
- **Autoplay**: browsers block audio before the first interaction, so the plugin grants itself media activation on the first pointer press or key press. A turn that ends before you have touched the window stays silent; the next turn does not.
- **Bundle, not a patch**: the package ships `cordis.patch.yml`, so DSH lists it under Plugins with its row and a Configure page rather than as a loose Loader row.
- **Nothing leaves the machine**: the clips are embedded in the client bundle; the plugin makes no network request at runtime.

## Development

```sh
npm run fetch:sounds   # download the OpenCode clips into assets/audio (needs network)
npm run build          # regenerate lib/client.js from src/client.js + assets/audio
npm test               # offline checks for the generated bundle
```

`lib/client.js` is generated and committed, because DSH serves exactly one script per plugin row: every clip is embedded in it as a data URI. Edit `src/client.js` and rebuild; do not edit `lib/client.js`.

The source layout:

| Path | Role |
| --- | --- |
| `src/client.js` | Browser half: event detection, playback, and the Plugins page pickers |
| `lib/client.js` | Generated browser bundle (committed so the package loads as installed) |
| `lib/index.js` | Host half: an empty `apply` that gives the Loader a row |
| `assets/audio` | The OpenCode clips, as downloaded |
| `scripts/build.mjs` | Embeds `assets/audio` into `lib/client.js` |
| `scripts/fetch-sounds.mjs` | Maintainer tool that refreshes `assets/audio` from OpenCode |

## Credits

The sound library comes from the [OpenCode](https://github.com/anomalyco/opencode) desktop app (`packages/ui/src/assets/audio`) and is MIT-licensed. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

MIT. See [LICENSE](LICENSE).
