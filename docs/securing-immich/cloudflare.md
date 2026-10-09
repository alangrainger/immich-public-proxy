# Cloudflare

Cloudflare sits in front of your reverse proxy. Requests without a certificate or the secret header are refused at
Cloudflare's edge, attacks are absorbed there, your home IP address is not published, and Cloudflare Tunnel works
without a public IP. There are two hops to set up: your devices to Cloudflare, and Cloudflare to your proxy.

Two limits apply. Cloudflare refuses request bodies over 100 MB on the Free and Pro plans (200 MB on Business), so
videos larger than that cannot be uploaded from the app through this hostname. And Cloudflare terminates TLS, so it
sees your traffic.

## Before you start

1. Your domain is on Cloudflare, the Immich hostname is proxied (orange cloud), and the SSL/TLS encryption mode is
   **Full (strict)**.
2. Your reverse proxy serves Immich on that hostname as in [Your own reverse proxy](/securing-immich/reverse-proxy),
   but without the client certificate block: Cloudflare does that check instead. Or you use a Tunnel, below, and
   need no public port at all.
3. IPP has its own hostname. The certificate rule applies to the whole Immich hostname.

## Step 1: your devices to Cloudflare

### Cloudflare client certificates

Cloudflare issues certificates from its own CA, up to 100 active per zone, on every plan. The certificates from
[Client certificates](/securing-immich/client-certificates) are not used here.

1. In the Cloudflare dashboard, go to **SSL/TLS**, **Client Certificates**, then **Add Certificate**. Let
   Cloudflare generate the private key, choose a validity period and select **Continue**.
2. Copy the certificate and the private key now; they are shown once. Save them as `alans-phone.crt` and
   `alans-phone.key`, then make the file your device will import:

   ```bash
   openssl pkcs12 -export -inkey alans-phone.key -in alans-phone.crt -out alans-phone.pfx
   ```

3. Repeat for each device, so that any one can be revoked on its own.
4. In the **Hosts** section of the same page, select **Edit** and enter the Immich subdomain (`immich` for
   `immich.example.com`). Cloudflare now asks for a certificate on that hostname.
5. Asking is not enforcing. Go to **Security**, **WAF**, **Custom rules** and create a rule with the action
   **Block** and this expression, using the Expression Builder's edit mode:

   ```
   http.host eq "immich.example.com"
   and (not cf.tls_client_auth.cert_verified or cf.tls_client_auth.cert_revoked)
   and not any(http.request.headers["x-immich-key"][*] eq "long-random-secret")
   ```

   The last line lets the Immich app in with a secret header instead of a certificate; see
   [Authenticating the Immich app](/securing-immich/immich-app). Leave it out to require a certificate from
   everything.

6. Install the `.pfx` files as in [Install the certificate on your devices](/securing-immich/devices).

To revoke a device, go to **Client Certificates**, open its certificate and select **Revoke**. The
`cert_revoked` check in the rule blocks it immediately.

### Your own CA instead

Access mutual TLS lets Cloudflare check certificates from your own CA, so one `.pfx` from the script works at
Cloudflare and at your proxy alike. It is on the paid Zero Trust plans, not the free one. In **Zero Trust**, go to
**Access controls**, **Service credentials**, **Mutual TLS**, add `client-ca.crt` and associate the Immich hostname.
Then create an Access application for the hostname with a policy whose action is **Service Auth** and whose rule is
**Valid Certificate**. The action must be Service Auth: a policy that leads to a login page locks the Immich app out.

## Step 2: Cloudflare to your proxy

Without this step, anyone who finds your IP address can connect to your proxy directly and skip the checks above.

### A public origin: Authenticated Origin Pulls

Cloudflare presents its own client certificate to your origin on every request, and your proxy refuses connections
without it. On every plan, and both halves are needed.

1. In the dashboard, go to **SSL/TLS**, **Origin Server** and turn on **Authenticated Origin Pulls**.
2. Download Cloudflare's certificate to your proxy's `certs/` folder:

   ```bash
   curl -o certs/cloudflare-origin-pull-ca.pem https://developers.cloudflare.com/ssl/static/authenticated_origin_pull_ca.pem
   ```

3. Require it at the proxy. This takes the place of the client certificate block from
   [Your own reverse proxy](/securing-immich/reverse-proxy): your devices' certificates are checked by Cloudflare,
   and Cloudflare's certificate by your proxy.

   **Caddy**

   ```
   immich.example.com {
       tls {
           client_auth {
               mode require_and_verify
               trusted_ca_cert_file /data/certs/cloudflare-origin-pull-ca.pem
           }
       }
       reverse_proxy immich-address:2283
   }
   ```

   **nginx**

   ```nginx
       ssl_client_certificate /etc/nginx/certs/cloudflare-origin-pull-ca.pem;
       ssl_verify_client on;
   ```

   **Traefik**

   ```yaml
         clientAuth:
           caFiles:
             - /etc/traefik/certs/cloudflare-origin-pull-ca.pem
           clientAuthType: RequireAndVerifyClientCert
   ```

This certificate proves a request came through Cloudflare's network. Your proxy must answer only for your own
hostnames, which the configs above do, so a request through someone else's Cloudflare zone is not served.
Allow-listing Cloudflare's IP ranges at the proxy is an optional extra, not a substitute.

### Cloudflare Tunnel

With a Tunnel there is no public port: `cloudflared` runs on your network, connects out to Cloudflare, and
Cloudflare sends requests down that connection. Authenticated Origin Pulls does not apply and is not needed, as long
as nothing else publishes the proxy's port. The Immich hostname is an ordinary proxied hostname, so the client
certificate and WAF rule from step 1 apply to it.

In **Zero Trust**, go to **Networks**, **Tunnels**, create a tunnel and run the `cloudflared` container it gives you
on the same network as Immich. Add a public hostname of `immich.example.com` with the service
`http://immich-address:2283`. Cloudflare terminates TLS and forwards WebSockets, so no reverse proxy is needed for
Immich at all.

## Check it

From any machine, without a certificate or the header:

```bash
curl -i https://immich.example.com/api/server/ping
```

Cloudflare answers `403` with its block page. With the header, or with a certificate (`--cert alans-phone.crt --key
alans-phone.key`), Immich answers `{"res":"pong"}`.

Then try to reach your proxy directly, skipping Cloudflare:

```bash
curl --resolve immich.example.com:443:YOUR_PUBLIC_IP https://immich.example.com/api/server/ping
```

With Authenticated Origin Pulls the proxy refuses the connection; with a Tunnel there is nothing listening.

In the Immich web UI, the server status in the bottom left reads **Online**. **Offline** means your proxy is not
forwarding WebSockets; Cloudflare and Tunnel pass them through.
