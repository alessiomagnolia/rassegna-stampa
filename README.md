# Rassegna Stampa Generator

Piattaforma web per la generazione automatica di rassegne stampa e comunicati stampa tramite Intelligenza Artificiale. Il progetto include un'estetica "Premium Editoriale" pulita ed elegante, supporta la Light e Dark mode, ed estrae e formatta i contenuti in layout pronti per l'esportazione.

## Funzionalità Principali

- **Generazione Automatica**: Estrazione di contenuti tramite Google News e RSS.
- **Supporto Intelligenza Artificiale**: Generatore di Comunicati Stampa integrato con stili di scrittura configurabili.
- **UI Premium Editoriale**: Design pulito, minimalistico e professionale (Light/Dark Mode).
- **Gestione Multi-Testata**: Sistema di archiviazione per loghi di diverse testate giornalistiche.
- **Export PDF Elegante**: Crea file pronti all'uso per i tuoi clienti.

## Requisiti

- Node.js (v18 o superiore consigliato)
- Puppeteer (installato automaticamente come dipendenza npm)
- Connessione internet (per estrazione articoli e chiamate API)

## Installazione

1. Clona il repository:
   ```bash
   git clone https://github.com/tuo-username/rassegna-stampa.git
   cd rassegna-stampa
   ```

2. Installa le dipendenze:
   ```bash
   npm install
   ```

3. Crea un file `.env` (se necessario per configurare chiavi API o variabili ambientali aggiuntive, es. `PORT=3000`).

## Avvio del Server

Per avviare l'applicazione in ambiente di sviluppo/produzione locale:

```bash
npm start
# Oppure se utilizzi nodemon:
npm run dev
```

L'applicazione sarà accessibile all'indirizzo `http://localhost:3000` (o la porta configurata).

## Struttura del Progetto

- `/public`: File front-end (HTML, CSS, JS lato client)
- `/routes`: Router Express per le API
- `/services`: Logica di business (Puppeteer, scraping, intelligenza artificiale)
- `/middleware`: Middleware Express (Autenticazione)
- `/database`: Modelli e storage dati locale (Loghi, Storico)

## License
MIT License
