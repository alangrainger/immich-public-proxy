# Redirecting your root domain to a share

If you have a dedicated domain for your photos, you might want the root of that domain
to open a specific share, rather than showing the default IPP landing page. For example:

```
photos.yourdomain.net  →  your photo album
```

IPP has no setting for this, because it would mean storing a share key. Do it in your reverse proxy instead.

## Examples

### Caddy

```
photos.yourdomain.net {
	# Redirect the root to your share
	redir / /s/example-share 302
	# Alternatively you could rewrite, so the gallery appears at the root:
	#rewrite / /s/example-share
	reverse_proxy immich-public-proxy:3000
}
```

Use `redir` to send visitors to the share URL, or `rewrite` if you want the gallery
to appear at the root of your domain without changing the URL in the browser.

The example above uses a named slug link (`/s/example-share`). This works the same
with a standard share link, e.g. `/share/ffSw63qnIYMtpmg0RNvO...`.
