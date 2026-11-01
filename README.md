# Dashboard Medico

Cartella clinica personale con assistente AI (Claude), in una sola pagina web.

## File

| File | Cosa contiene | Su GitHub? |
|---|---|---|
| `index.html` | L'app (nessun dato personale) | Sì |
| `dati_profilo.js` | **I dati sanitari personali** | **No, mai** (escluso da `.gitignore`) |
| `worker.js` | Il proxy Cloudflare verso l'API di Anthropic | Sì (nessuna chiave dentro) |
| `manifest.webmanifest`, `icona-*.png` | Installazione sulla schermata Home del telefono | Sì |

## Come si usa

- **Sul computer:** tieni `index.html` e `dati_profilo.js` nella stessa cartella e apri `index.html`.
- **Da un sito pubblico (es. GitHub Pages):** la pagina si apre vuota; carica i dati con **⬆️ Importa i miei dati** (una volta per dispositivo).
- **Da un sito protetto (Cloudflare Pages + Access):** puoi caricare anche `dati_profilo.js`, perché la pagina si apre solo dopo il login.

## Aggiornare i dati

Modifica da **✏️ Modifica** (le modifiche restano nel browser) oppure sostituisci `dati_profilo.js` e cambia il valore `_versione`: all'apertura la dashboard propone di usare i dati nuovi.

## Worker (Cloudflare)

Variabili da impostare nel Worker: `ANTHROPIC_API_KEY` e `APP_TOKEN` (Secret). Facoltativa: `ALLOWED_ORIGINS` con gli indirizzi da cui è consentito usarlo (es. `null,https://tuosito.pages.dev`; `null` = file aperto dal computer).
