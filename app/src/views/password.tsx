interface PasswordProps {
  shareKey: string
  notifyInvalidPassword: boolean
}

const submitScript = `
  async function submitForm (formElement) {
    const formData = new FormData(formElement)
    try {
      const res = await fetch('/share/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(formData.entries()))
      })
      if (res.status === 429) {
        const existing = document.getElementById('rate-limit-msg')
        if (existing) existing.remove()
        const msg = document.createElement('small')
        msg.id = 'rate-limit-msg'
        msg.textContent = 'Too many invalid attempts. Please wait and try again.'
        const pw = formElement.querySelector('input[type=password]')
        pw.insertAdjacentElement('afterend', msg)
      } else {
        // 200 (success) reloads into the gallery; 401 (wrong password) reloads
        // into the password page with the "Invalid password" notice.
        window.location.reload()
      }
    } catch (e) { }
  }

  document.getElementById('unlock')
    .addEventListener('submit', function (e) {
      e.preventDefault()
      submitForm(this)
    })
`

export function Password ({ shareKey, notifyInvalidPassword }: PasswordProps) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0"/>
        <title>Password required</title>
        <link rel="icon" href="/share/static/favicon.ico" type="image/x-icon"/>
        <link type="text/css" rel="stylesheet" href="/share/static/pico.min.css"/>
      </head>
      <body>
        <header></header>
        <main class="container">
          <div class="grid">
            <div></div>
            <div>
              <form id="unlock" method="post">
                <input
                  type="password"
                  name="password"
                  placeholder="Password"
                  aria-label="Password"
                  required
                  autoFocus
                />
                {notifyInvalidPassword && <small>Invalid password</small>}
                <input type="hidden" name="key" value={shareKey}/>
                <button type="submit">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                       class="lucide lucide-lock-open">
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                  </svg>
                  Unlock
                </button>
              </form>
            </div>
            <div></div>
          </div>
        </main>
        <script dangerouslySetInnerHTML={{ __html: submitScript }}/>
      </body>
    </html>
  )
}
