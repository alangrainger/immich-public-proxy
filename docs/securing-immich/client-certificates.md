# Client certificates (mTLS)

A client certificate lets a device prove who it is before it reaches Immich. You act as your own certificate
authority (CA), issue one certificate per person or device, and install each one where it is used. The proxy trusts
your CA and refuses everything else. This page covers making the certificates;
[Your own reverse proxy](/securing-immich/reverse-proxy) covers the proxy config.

## Generate a certificate

Save this as `make-cert.sh` and run it once per device, giving the device a name. The first run also creates the CA.

```bash
#!/bin/bash
# Usage: ./make-cert.sh alans-phone
set -e
NAME="${1:?Give the device a name, e.g. ./make-cert.sh alans-phone}"
mkdir -p certs

# The CA, created on the first run only. Keep client-ca.key private.
if [ ! -f certs/client-ca.key ]; then
  openssl genrsa -out certs/client-ca.key 4096
  openssl req -new -x509 -nodes -days 3650 -key certs/client-ca.key -subj "/CN=Immich CA" -out certs/client-ca.crt
fi

# A certificate for this device, signed by the CA
openssl req -newkey rsa:4096 -nodes -keyout "certs/$NAME.key" -subj "/CN=$NAME" -out "certs/$NAME.req"
openssl x509 -req -in "certs/$NAME.req" -days 3650 -CA certs/client-ca.crt -CAkey certs/client-ca.key -CAcreateserial -out "certs/$NAME.crt"
rm "certs/$NAME.req"

echo
echo "Choose a strong password. Devices ask for it when importing the certificate, and it protects the private key."
echo

# The file to install on the device: the certificate and its private key in one
openssl pkcs12 -export -inkey "certs/$NAME.key" -in "certs/$NAME.crt" -out "certs/$NAME.pfx"
```

The script produces:

- `client-ca.crt` - give this to your reverse proxy. It is the only file the proxy needs.
- `client-ca.key` - keep it private. Anyone with it can issue certificates your proxy trusts.
- `<name>.pfx` - install this on the device. It holds the private key, so move it by AirDrop, USB cable or a
  password manager's file attachment, not email, and delete the copy afterwards.

Make one certificate per person or device rather than sharing one, so that any one of them can be revoked without
the others.

## Revoke a certificate

The proxy trusts every certificate your CA has signed, so a certificate stays valid until the CA is replaced. To cut
a device off, make a new CA, issue new certificates to the devices you still want, and replace `client-ca.crt` at
the proxy. The old certificates stop working immediately. nginx can instead check a revocation list (`ssl_crl`);
Caddy and Traefik cannot without plugins, so reissuing is the only option there.

## Expiry

The certificates last ten years. When one expires the device is refused, so run the script again with the same name
and install the new `.pfx`.

## Where they are used

- [Your own reverse proxy](/securing-immich/reverse-proxy): the proxy checks the certificate against `client-ca.crt`.
- [Cloudflare](/securing-immich/cloudflare): on the free plan Cloudflare issues its own client certificates, and
  the ones made here are not used. Access mutual TLS, on the paid Zero Trust plans, checks these instead.
- A VPN: no certificates are needed.

Installing a `.pfx` on each platform, including in the Immich app, is in
[Install the certificate on your devices](/securing-immich/devices).
