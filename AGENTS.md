# Regole di lavoro per rassegna-stampa

Queste regole valgono per chiunque modifichi il progetto (persone, Claude, Antigravity o altri assistenti).

## Pubblicazione
- Si lavora su `main`: ogni push su `main` viene pubblicato subito su Render (sito online).
- Prima di ogni push chiedere conferma al proprietario del progetto.

## Versione mobile
- Le modifiche pensate per smartphone vanno **solo** in `public/mobile.css`.
  Il file è caricato con `media="(max-width: 768px)"`, quindi sui computer viene ignorato
  e non può cambiare la versione desktop.
- Non sistemare il mobile modificando `styles.css`, `theme-ink.css` o gli stili inline delle pagine.
- Se serve JavaScript solo per il mobile, eseguirlo solo quando
  `window.matchMedia('(max-width: 768px)').matches` è vero (va in `public/mobile.js`).
- Dopo ogni modifica a `mobile.css` o `mobile.js` cambiare il `?v=` nelle pagine che li caricano:
  il server fa tenere i file in cache 24 ore e i telefoni continuerebbero a usare la versione vecchia.

## Grafica
- Tasti, campi e funzionalità esistenti non vanno tolti né spostati: i restyling cambiano solo l'aspetto.
- Colori della piattaforma: viola `#7B2CBF` e verde `#00E676`.

## Controllo desktop prima del push
Confronta la versione desktop attuale con quella dell'ultimo commit (quella online), pagina per pagina.

1. In due terminali PowerShell, dalla cartella del progetto:
   - `powershell -File tools/desktop-check/serve.ps1 -Label prima` (porta 8781)
   - `powershell -File tools/desktop-check/serve.ps1 -Label dopo` (porta 8782)
2. In un browser a larghezza desktop (1366x900) aprire, una dopo l'altra:
   - `http://localhost:8781/__check/start` e attendere la scritta "Controllo desktop completato"
   - `http://localhost:8782/__check/start` e attendere la stessa scritta
3. `node tools/desktop-check/compare.js`
   - "OK: versione desktop identica" → si può pubblicare.
   - "DIFFERENZE sul desktop" → elenca cosa si è spostato, ridimensionato, è comparso o sparito: correggere prima del push.

I rilievi vengono salvati in `%TEMP%\rassegna-desktop-check\` (fuori dal progetto) e la cartella `tools/` non viene inclusa nel deploy.
