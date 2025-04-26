# Customising your web responses

To avoid giving information away about your server, IPP responds with a limited set of HTTP status codes:

| Code | Reason                                                                                          |
|------|-------------------------------------------------------------------------------------------------|
| 503  | Healthcheck failed: Immich is not accessible. Only on the `/healthcheck` route.                 |
| 401  | Invalid password provided for a password-protected share link.                                  |
| 404  | All other invalid requests, e.g. album doesn't exist, share link is expired, non-existing file. |

Instead of sending the 404 code, you can customise that response by [changing the configuration option](../README.md#immich-public-proxy-options) for `customInvalidResponse`.

Possible options are:

| Option           | Data type | Example                 | Action                                   |
|------------------|-----------|-------------------------|------------------------------------------|
| HTTP status code | `integer` | `404`                   | Sends an HTTP status code.               |
| Redirect URL     | `string`  | `"https://example.com"` | Redirects to another website.            |
| `null`           | `null`    | `null`                  | Drops the connection without responding. |
| `false`          | `boolean` | `false`                 | Responds with the default status code.   |

If you want to send a custom 404 page, you would do that with either of the below options - using a [custom function](#custom-function), or through your [reverse proxy](#customising-the-response-using-your-reverse-proxy).

## Custom function

If you want to go even further, you can write your own custom function. Do this by taking a copy of the `app/dist/invalidRequestHandler.js` file,
then mounting it back as a Docker volume into the correct location for the container to use.

## Customising the response using your Reverse Proxy

You can also choose to customise these responses using your reverse proxy, which might give you more flexibility depending on your use-case.

Here are some examples:

### Caddy

```
https://ipp.example.com {
    reverse_proxy 192.168.1.1:3000 {
        @404 status 404
        handle_response @404 {
            respond "This would be a custom response"
        }
    }
}
```

### Apache

```
<VirtualHost *:80>
    ProxyErrorOverride On 404
    ErrorDocument 404 /custom_404.html
    Alias /custom_404.html /var/www/html/error-pages/404.html
</VirtualHost>
```
