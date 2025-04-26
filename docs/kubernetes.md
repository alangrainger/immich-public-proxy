# Install with Kubernetes

Thanks to [@vanchaxy](https://github.com/vanchaxy) for providing these docs in [#42](https://github.com/alangrainger/immich-public-proxy/issues/42).

See the [official Immich docs](https://immich.app/docs/install/kubernetes/) for additional information.

1. Add `app-template` chart to the dependencies. It's important to use the same `app-template` version as immich (1.4.0) if installing under the same umbrella chart.
```
apiVersion: v2
name: immich
version: 0.0.0
dependencies:
  - name: immich
    repository: https://immich-app.github.io/immich-charts
    version: 0.9.0
  - name: app-template
    repository: https://bjw-s.github.io/helm-charts
    version: 1.4.0
    alias: immich-public-proxy
```
2. Add deployment and service to values.
```
immich:
   # immich values
   ...

immich-public-proxy:
  global:
    nameOverride: public-proxy

  env:
    IMMICH_URL: http://immich-server:2283

  image:
    repository: alangrainger/immich-public-proxy
    tag: 1.5.4
    pullPolicy: IfNotPresent

  service:
    main:
      enabled: true
      primary: true
      type: ClusterIP
      ports:
        http:
          enabled: true
          primary: true
          port: 3000
          protocol: HTTP

  ingress:
    main:
      enabled: true
      hosts:
        - host: &host-share immich-share.local
          paths:
            - path: "/"
      tls:
        - secretName: immich-share-tls
          hosts:
            - *host-share
```
