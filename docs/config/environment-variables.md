# Environment variables

Connection and runtime settings are passed as environment variables, typically in the `environment` section of your
`docker-compose.yml`. Only `IMMICH_URL` is required. Everything that controls how shares look and behave is JSON
config instead; see the [Configuration overview](/config/).

## `IMMICH_URL`

**Required**

The URL of your Immich server as reached from inside the IPP container, for example `http://immich_server:2283`.
Use the local address, not your public one: IPP is the only thing that needs to be public. A trailing slash is
ignored.

From inside a container, `localhost` does not reach Immich. If IPP logs "Unable to reach Immich" at startup, see
[Troubleshooting](/troubleshooting). If the address is `https://` with a certificate from your own CA, see
[`NODE_EXTRA_CA_CERTS`](#node-extra-ca-certs).

## `PUBLIC_BASE_URL`

**Optional** · **Default:** derived from each request

The public base URL of IPP without a trailing slash, for example `https://photos.example.com`. The gallery uses
relative URLs everywhere except the `og:image` tag that messaging apps read for link previews, which must be fully
qualified. When unset, IPP builds it from the incoming request's protocol and `Host` header.

Set it if link previews show `http://` or a private address. Leave it unset if you serve IPP from several domains,
and make sure your reverse proxy forwards the original `Host` header.

## `IPP_PORT`

**Optional** · **Default:** `3000`

The port the web server listens on inside the container. If you change it, update the `ports` mapping and the
`healthcheck` in your compose file to match.

## `IPP_CONFIG`

**Optional** · **Default:** `/app/config.json`

Path to the JSON config file, either absolute or relative to the working directory. Use it to keep the config
somewhere other than the default path. The usual approach is to mount your file over the default path instead, as
described in the [Configuration overview](/config/#mount-a-file).

## `CONFIG`

**Optional**

The JSON config as an inline string. When set, no config file is read at all. See
[Inline via env var](/config/#inline-via-env-var) for an example.

## `NODE_EXTRA_CA_CERTS`

**Optional**

A standard Node.js variable rather than an IPP one: the path, inside the container, to a PEM file holding one or more
CA certificates that Node should trust in addition to its built-in roots. Set it when `IMMICH_URL` is an `https://`
address whose certificate is signed by a CA you run, and mount the CA file into the container:

```yaml
    environment:
      IMMICH_URL: https://immich.example.com
      NODE_EXTRA_CA_CERTS: /certs/ca.crt
    volumes:
      - ./ca.crt:/certs/ca.crt:ro
```

The file is read once at startup, so recreate the container after changing it. See
[Troubleshooting](/troubleshooting#ipp-logs-unable-to-reach-immich-and-immich-has-a-certificate-from-your-own-ca)
for the symptoms and the alternatives.

## Set by the image

`APP_VERSION` and `NODE_ENV` are set by the Docker image and are not meant to be changed.

## The upload service

The optional upload service reads the same variables, with the same meanings, so the `environment` block can be
copied across. `PUBLIC_BASE_URL` stays IPP's public URL, which gives the upload page a back button to the gallery.
See [Add the upload service](/visitor-uploads#add-the-upload-service).
