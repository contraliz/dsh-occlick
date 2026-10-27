# dsh-occlick

**Plays an OpenCode turn-end sound in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)**, with a picker for the whole OpenCode sound library.

OpenCode ships a small library of notification clips for its desktop app. This plugin brings that library to DSH and plays one when an agent turn finishes, so you can look away while a long task runs.

- **One click per turn**: the sound plays when a Session's turn ends, not for every step, tool call, or streamed token.
- **45 sounds, one picker**: everything OpenCode ships — Alert, Bip-bop, Nope, Staplebops, and Yup — with an instant preview as you choose.
- **Configured in DSH**: the picker lives on the **Plugins** page, on the plugin's own row, so it follows the same enable/disable and uninstall flow as any other bundle.
- **Quiet where it should be**: subagent turns stay silent, and a burst of simultaneous endings plays once.

## What it does

The browser half watches the client Session list. When a Session's `running` bit falls from `true` to `false`, it plays the chosen clip:

| Transition | Sound |
| --- | --- |
| `true → false` | Plays once |
| `false → false` | Silent (list refreshes are frequent) |
| Subagent Session | Silent |
| Mounted over an idle list | Silent (no history replay) |

Because DSH publishes running state per Session, a turn that ends in the background still makes the sound. A turn that is interrupted or fails also counts as an ending.

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

## Choose the sound

Open **Plugins → dsh-occlick → Configure**. The row's page shows one selector listing every clip, labelled the way OpenCode labels them.

The default is **Staplebops 01**, the same clip OpenCode's desktop app uses for a finished turn.

Choosing a sound saves it and plays it immediately, so you can audition without waiting for a turn.

| Family | Count | Library names |
| --- | --- | --- |
| Alert | 10 | `alert-01` … `alert-10` |
| Bip-bop | 10 | `bip-bop-01` … `bip-bop-10` |
| Nope | 12 | `nope-01` … `nope-12` |
| Staplebops | 7 | `staplebops-01` … `staplebops-07` |
| Yup | 6 | `yup-01` … `yup-06` |

The choice is stored in the browser (`localStorage`), so it is per browser rather than per profile. Clearing site data restores the default.

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
| `src/client.js` | Browser half: turn-end detection, playback, and the Plugins page selector |
| `lib/client.js` | Generated browser bundle (committed so the package loads as installed) |
| `lib/index.js` | Host half: an empty `apply` that gives the Loader a row |
| `assets/audio` | The OpenCode clips, as downloaded |
| `scripts/build.mjs` | Embeds `assets/audio` into `lib/client.js` |
| `scripts/fetch-sounds.mjs` | Maintainer tool that refreshes `assets/audio` from OpenCode |

## Credits

The sound library comes from the [OpenCode](https://github.com/anomalyco/opencode) desktop app (`packages/ui/src/assets/audio`) and is MIT-licensed. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

MIT. See [LICENSE](LICENSE).
