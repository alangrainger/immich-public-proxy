# Running IPP on a single domain with Immich

Because everything related to IPP happens within the `/share` and `/s` paths,
you can serve Immich and IPP on the same domain by configuring your reverse
proxy to send all `/share/*` and `/s/*` requests to IPP.

## Caddy

An example Caddyfile. The `basic_auth` block protects Immich itself; see the
[Caddy docs](https://caddyserver.com/docs/caddyfile/directives/basic_auth) for how to generate the password hash.

```
https://photos.example.com {
    # Immich Public Proxy paths
    @public path /share /share/* /s/*
    handle @public {
        # Your IPP server and port
        reverse_proxy YOUR_SERVER:3000
    }
    
    # All other paths, require basic auth and send to Immich
    handle {
        basic_auth {
            user password_hash
        }
        # Your Immich server and port
        reverse_proxy YOUR_SERVER:2283
    }
}
```
