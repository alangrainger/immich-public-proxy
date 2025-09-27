# Running IPP on a single domain with Immich

Because everything related to IPP happens within the `/share` path,
you can serve Immich and IPP on the same domain by configuring your reverse
proxy to send all `/share/*` requests to IPP.

## Caddy

[View Caddy docs](https://caddyserver.com/docs/caddyfile/directives/basic_auth) for more info. Here's an example of how to do this with Caddy:

```
https://your-domain.com {
    # Immich Public Proxy paths
    @public path /share /share/*
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
