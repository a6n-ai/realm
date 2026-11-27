const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function inviteMail(link: string, inviterName: string) {
  return {
    subject: `${inviterName} invited you to a6n`,
    html: `<p>${esc(inviterName)} invited you to a6n.</p><p><a href="${esc(link)}">Accept the invite</a></p><p>If the button does not work, open this link: ${esc(link)}</p>`,
    text: `${inviterName} invited you to a6n.\n\nAccept the invite: ${link}\n`,
  };
}

export function signInCodeMail(code: string) {
  return {
    subject: `Your a6n sign-in code: ${code}`,
    html: `<p>Your a6n sign-in code is <strong>${esc(code)}</strong>.</p><p>It expires soon. If you did not ask for it, ignore this email.</p>`,
    text: `Your a6n sign-in code is ${code}.\n\nIt expires soon. If you did not ask for it, ignore this email.\n`,
  };
}
