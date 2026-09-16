/**
 * emailService.js
 * Invio email via Nodemailer (supporta Gmail app-password e SMTP generici).
 * Configurazione tramite variabili d'ambiente:
 *   EMAIL_HOST     (default: smtp.gmail.com)
 *   EMAIL_PORT     (default: 587)
 *   EMAIL_USER     es. tuoemail@gmail.com
 *   EMAIL_PASS     app-password Gmail (o password SMTP)
 *   EMAIL_FROM     es. "Rassegna Stampa <tuoemail@gmail.com>"
 *
 * Se EMAIL_USER non è impostato, il servizio opera in modalità "link only"
 * (non invia email ma restituisce comunque il link di invito).
 */

const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return null; // Modalità link-only
    }

    const emailUser = process.env.EMAIL_USER.trim();
    // Rimuove eventuali spazi dalla password per le app (Google la genera con spazi tipo "abcd efgh ijkl mnop")
    const emailPass = process.env.EMAIL_PASS.replace(/\s+/g, '');
    const isGmail = emailUser.toLowerCase().includes('@gmail.com') || emailUser.toLowerCase().includes('@googlemail.com');

    if (isGmail) {
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: emailUser,
                pass: emailPass,
            },
            connectionTimeout: 8000,
            greetingTimeout: 8000,
            socketTimeout: 12000,
        });
    } else {
        transporter = nodemailer.createTransport({
            host:   process.env.EMAIL_HOST || 'smtp.gmail.com',
            port:   parseInt(process.env.EMAIL_PORT || '465'),
            secure: (process.env.EMAIL_PORT === '465' || !process.env.EMAIL_PORT),
            auth: {
                user: emailUser,
                pass: emailPass,
            },
            connectionTimeout: 8000,
            greetingTimeout: 8000,
            socketTimeout: 12000,
        });
    }

    return transporter;
}

/**
 * Invia l'email di invito al team.
 * @param {string} toEmail          - Indirizzo email del destinatario
 * @param {string} inviterName      - Nome/azienda di chi invita
 * @param {string} teamName         - Nome del team
 * @param {string} inviteLink       - Link completo di accettazione
 * @returns {Promise<boolean>}      - true se inviata, false se in modalità link-only
 */
async function sendInviteEmail(toEmail, inviterName, teamName, inviteLink) {
    const t = getTransporter();

    if (!t) {
        console.log(`[Email] Modalità link-only. Link invito: ${inviteLink}`);
        return false;
    }

    const fromName  = process.env.EMAIL_FROM || `Rassegna Stampa <${process.env.EMAIL_USER}>`;
    const todayStr  = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

    const htmlBody = `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">

          <!-- Header -->
          <tr>
            <td style="background:#7c5cff;padding:28px 36px;">
              <p style="margin:0;font-size:13px;color:#e0d9ff;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Rassegna Stampa</p>
              <h1 style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:700;">Sei stato invitato a collaborare</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 36px;color:#1e293b;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
                <strong>${inviterName}</strong> ti ha invitato a far parte del team <strong>${teamName}</strong> sulla piattaforma Rassegna Stampa.
              </p>
              <p style="margin:0 0 28px;font-size:14px;color:#475569;line-height:1.6;">
                Come membro del team potrai vedere e modificare le stesse rassegne stampa, clienti e comunicati dei tuoi colleghi.
              </p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#7c5cff;border-radius:8px;">
                    <a href="${inviteLink}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.2px;">
                      Accetta l'invito
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">
                Se il pulsante non funziona, copia e incolla questo link nel browser:<br>
                <a href="${inviteLink}" style="color:#7c5cff;word-break:break-all;">${inviteLink}</a>
              </p>

              <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;">
                L'invito scade tra 7 giorni (${todayStr}).
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 36px;border-top:1px solid #e2e8f0;background:#f8fafc;">
              <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">
                Hai ricevuto questa email perché qualcuno ha inserito il tuo indirizzo su Rassegna Stampa.<br>
                Se non ti aspettavi questo invito, puoi ignorare questa email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const textBody = `
Sei stato invitato nel team "${teamName}" da ${inviterName}.

Accetta l'invito: ${inviteLink}

L'invito scade tra 7 giorni.
Se non ti aspettavi questo invito, ignora questa email.
`.trim();

    try {
        await Promise.race([
            t.sendMail({
                from:    fromName,
                to:      toEmail,
                subject: `${inviterName} ti ha invitato nel team "${teamName}"`,
                text:    textBody,
                html:    htmlBody,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP_TIMEOUT')), 10000))
        ]);
        console.log(`[Email] Invito inviato con successo a ${toEmail}`);
        return true;
    } catch (err) {
        console.error('[Email] Errore durante invio email via Nodemailer:', err.message);
        throw err;
    }
}

module.exports = { sendInviteEmail };
