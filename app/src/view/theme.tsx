// Mirrors Immich's FOUC-prevention pattern: read color-theme from localStorage
// (or fall back to OS preference), then add/remove .dark on <html> before paint.
// Source: immich-app/immich v2.7.5 web/src/app.html (2026-05-23).
const themeScript = `
  const key = 'color-theme';
  let theme = localStorage.getItem(key);
  if (!theme) {
    theme = { value: 'light', system: true };
  } else if (theme === 'dark' || theme === 'light') {
    theme = { value: theme, system: false };
    localStorage.setItem(key, JSON.stringify(theme));
  } else {
    theme = JSON.parse(theme);
  }
  let v = theme.value;
  if (theme.system) {
    v = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  if (v === 'dark') document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
`

export function ThemeScript () {
  return <script dangerouslySetInnerHTML={{ __html: themeScript }}/>
}
