/**
 * emailService.js
 * Invio email di invito team.
 * Supporta:
 * 1. Resend API (porta 443 HTTPS - compatibile 100% con il piano gratuito di Render)
 * 2. Nodemailer SMTP (Gmail app-password o SMTP standard)
 * 3. Link-only (se nessuna credenziale è configurata o se SMTP è bloccato da Render)
 */

const nodemailer = require('nodemailer');

function getTransporter() {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return null;
    }

    const emailUser = (process.env.EMAIL_USER || '').replace(/['"]/g, '').trim();
    const emailPass = (process.env.EMAIL_PASS || '').replace(/['"\s]/g, '').trim();

    if (!emailUser || !emailPass) return null;

    const isGmail = emailUser.toLowerCase().includes('@gmail.com') || emailUser.toLowerCase().includes('@googlemail.com');

    if (isGmail) {
        return nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: emailUser,
                pass: emailPass,
            },
            connectionTimeout: 6000,
            greetingTimeout: 6000,
            socketTimeout: 8000,
        });
    }

    return nodemailer.createTransport({
        host:   process.env.EMAIL_HOST || 'smtp.gmail.com',
        port:   parseInt(process.env.EMAIL_PORT || '465'),
        secure: (process.env.EMAIL_PORT === '465' || !process.env.EMAIL_PORT),
        auth: {
            user: emailUser,
            pass: emailPass,
        },
        connectionTimeout: 6000,
        greetingTimeout: 6000,
        socketTimeout: 8000,
    });
}

function buildEmailHtml(inviterName, teamName, inviteLink, todayStr) {
    return `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
          <tr>
            <td style="background:#7c5cff;padding:28px 36px;">
              <p style="margin:0;font-size:13px;color:#e0d9ff;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Rassegna Stampa</p>
              <h1 style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:700;">Sei stato invitato a collaborare</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 36px;color:#1e293b;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
                <strong>${inviterName}</strong> ti ha invitato a far parte del team <strong>${teamName}</strong> sulla piattaforma Rassegna Stampa.
              </p>
              <p style="margin:0 0 28px;font-size:14px;color:#475569;line-height:1.6;">
                Come membro del team potrai vedere e modificare le stesse rassegne stampa, clienti e comunicati dei tuoi colleghi.
              </p>
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
}

/**
 * Invia l'email di invito al team.
 */
async function sendInviteEmail(toEmail, inviterName, teamName, inviteLink, inviterEmail) {
    const todayStr = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
    const htmlBody = buildEmailHtml(inviterName, teamName, inviteLink, todayStr);
    const textBody = `Sei stato invitato nel team "${teamName}" da ${inviterName}.\n\nAccetta l'invito: ${inviteLink}\n\nL'invito scade tra 7 giorni.`;

    // 1. Resend REST API (porta 443 HTTPS - compatibile con tutti i piani Render)
    if (process.env.RESEND_API_KEY) {
        try {
            const apiKey = process.env.RESEND_API_KEY.replace(/['"\s]/g, '').trim();
            const fromSender = process.env.EMAIL_FROM || `${inviterName} tramite Rassegna Stampa <onboarding@resend.dev>`;
            
            const payload = {
                from: fromSender,
                to: [toEmail],
                subject: `${inviterName} ti ha invitato nel team "${teamName}"`,
                html: htmlBody,
                text: textBody,
            };
            if (inviterEmail) {
                payload.reply_to = inviterEmail;
            }

            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            const resData = await res.json();
            if (!res.ok) {
                let errDetail = resData.message || 'Errore API Resend';
                if (res.status === 403 && (errDetail.includes('onboarding@resend.dev') || errDetail.includes('only send to'))) {
                    errDetail = "Resend (dominio test) può inviare solo all'indirizzo email con cui ti sei registrato su Resend. Per inviare a qualsiasi email, aggiungi il tuo dominio su resend.com/domains.";
                }
                throw new Error(errDetail);
            }
            console.log(`[Email] Invito inviato con successo via Resend a ${toEmail}`);
            return true;
        } catch (resendErr) {
            console.error('[Email] Errore invio via Resend:', resendErr.message);
            throw resendErr;
        }
    }

    // 2. Nodemailer SMTP (Gmail / Custom SMTP)
    const t = getTransporter();

    if (!t) {
        console.warn('[Email] Credenziali EMAIL_USER/EMAIL_PASS mancanti.');
        const err = new Error('Variabili EMAIL_USER o EMAIL_PASS non configurate su Render.');
        err.code = 'CONFIG_MISSING';
        throw err;
    }

    const cleanUser = (process.env.EMAIL_USER || '').replace(/['"]/g, '').trim();
    const fromName  = process.env.EMAIL_FROM || `Rassegna Stampa <${cleanUser}>`;

    try {
        await Promise.race([
            t.sendMail({
                from:    fromName,
                to:      toEmail,
                subject: `${inviterName} ti ha invitato nel team "${teamName}"`,
                text:    textBody,
                html:    htmlBody,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP_TIMEOUT')), 8000))
        ]);
        console.log(`[Email] Invito inviato con successo via SMTP a ${toEmail}`);
        return true;
    } catch (err) {
        console.error('[Email] Errore durante invio SMTP:', err.message);
        if (err.message === 'SMTP_TIMEOUT' || err.message.includes('timeout') || err.message.includes('ETIMEDOUT')) {
            throw new Error('Render blocca le connessioni SMTP sui piani gratuiti. Invia direttamente il link qui sotto al tuo collega via WhatsApp/email.');
        }
        throw err;
    }
}

/**
 * Verifica lo stato di configurazione e la raggiungibilità del server SMTP.
 */
async function verifyConnection() {
    if (process.env.RESEND_API_KEY) {
        return { ok: true, type: 'resend', message: 'Configurato con Resend (API HTTPS porta 443 - attivo e compatibile con Render)' };
    }

    const rawUser = process.env.EMAIL_USER;
    const rawPass = process.env.EMAIL_PASS;

    if (!rawUser || !rawPass) {
        return {
            ok: false,
            error: "Variabili EMAIL_USER o EMAIL_PASS mancanti su Render.",
            details: { hasUser: !!rawUser, hasPass: !!rawPass }
        };
    }

    const t = getTransporter();
    if (!t) {
        return { ok: false, error: "Impossibile creare il transporter nodemailer." };
    }

    try {
        await Promise.race([
            t.verify(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP_TIMEOUT')), 6000))
        ]);
        const cleanUser = rawUser.replace(/['"]/g, '').trim();
        const masked = cleanUser.replace(/(.{2})(.*)(@.*)/, '$1***$3');
        return { ok: true, type: 'smtp', message: `Connessione SMTP verificata per ${masked}` };
    } catch (err) {
        let errMsg = err.message || 'Errore di autenticazione SMTP';
        if (err.message === 'SMTP_TIMEOUT' || err.message.includes('timeout') || err.message.includes('ETIMEDOUT')) {
            errMsg = 'Render blocca le porte SMTP in uscita (25, 465, 587) sul piano gratuito per prevenire abusi. Usa il link di invito generato oppure una chiave Resend API.';
        }
        return {
            ok: false,
            error: errMsg,
            code: err.code || null
        };
    }
}

module.exports = { sendInviteEmail, verifyConnection };
