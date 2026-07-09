/** Plain, reliable HTML for the two system emails (kept inline-styled for email clients). */

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
      <div style="width:32px;height:32px;border-radius:8px;background:#0f172a;color:#fff;font-weight:700;font-size:13px;line-height:32px;text-align:center">AI</div>
      <div style="font-weight:600;font-size:15px">AI Brain</div>
    </div>
    <h1 style="font-size:18px;margin:0 0 12px">${title}</h1>
    ${bodyHtml}
    <p style="color:#94a3b8;font-size:12px;margin-top:24px">If you weren't expecting this, you can ignore it.</p>
  </div>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 18px;border-radius:8px">${label}</a>`;
}

export function signInEmailHtml(link: string): string {
  return shell(
    "Your sign-in link",
    `<p style="font-size:14px;color:#475569;margin:0 0 18px">Click below to sign in to your AI Brain. This link is one-time and expires shortly.</p>
     ${button(link, "Sign in")}
     <p style="font-size:12px;color:#94a3b8;margin-top:16px;word-break:break-all">Or paste this URL:<br>${link}</p>`,
  );
}

export function inviteEmailHtml(params: {
  companies: string;
  link: string | null;
  loginUrl: string;
}): string {
  const cta = params.link
    ? `${button(params.link, "Open your AI Brain")}
       <p style="font-size:12px;color:#94a3b8;margin-top:16px">If that link has expired, sign in any time at <a href="${params.loginUrl}" style="color:#0f172a">${params.loginUrl}</a> with this email.</p>`
    : `${button(params.loginUrl, "Sign in")}
       <p style="font-size:12px;color:#94a3b8;margin-top:16px">Sign in with this email address to get a one-time link.</p>`;
  return shell(
    "You've been given access",
    `<p style="font-size:14px;color:#475569;margin:0 0 18px">You now have access to the AI Brain for <strong>${params.companies}</strong>. It brings your pipeline, revenue, marketing and AI tools together in one place.</p>
     ${cta}`,
  );
}
