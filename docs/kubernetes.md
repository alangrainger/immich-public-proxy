# Install with Kubernetes

See the [official Immich docs](https://immich.app/docs/install/kubernetes/) for additional information. This deployment uses the common chart Immich depends on ([bjw-s common library chart](https://github.com/bjw-s-labs/helm-charts/tree/common-5.0.1/charts/library/common)) to extend the deployment as described in the [Immich docs](https://github.com/immich-app/immich-charts/blob/main/README.md).

Modify the values of your Immich deployment in the `server` section. The first example uses the newer Gateway API `HTTPRoute`; the Ingress version follows it.

```yaml
server:
  enabled: true

  route:
    main:
      enabled: true
      kind: HTTPRoute
      parentRefs:
        - name: gateway
          namespace: kube-system
      hostnames:
        - immich.example.com
      rules:
        - backendRefs:
            - name: immich-server-main
              port: 2283
    immich-public-proxy:
      enabled: true
      kind: HTTPRoute
      parentRefs:
        - name: gateway
          namespace: kube-system
      hostnames:
        - photos.example.com
      rules:
        - backendRefs:
            - name: immich-server-immich-public-proxy
              port: 3000

  controllers:
    immich-public-proxy:
      containers:
        main:
          image:
            repository: alangrainger/immich-public-proxy
            tag: 4.0.0  # pin to the current release: https://github.com/alangrainger/immich-public-proxy/releases
            pullPolicy: IfNotPresent
          env:
            IMMICH_URL: http://immich-server-main:2283  # the in-cluster Immich service, not your public URL
            PUBLIC_BASE_URL: https://photos.example.com
          # Optional lockdown: IPP writes nothing to disk and needs no extra privileges
          securityContext:
            readOnlyRootFilesystem: true
            allowPrivilegeEscalation: false
            capabilities:
              drop:
                - ALL

  service:
    immich-public-proxy:
      controller: immich-public-proxy
      type: ClusterIP
      ports:
        http:
          port: 3000

  # The bjw-s common chart can get confused with more than one service (main and
  # immich-public-proxy), so the ServiceMonitor is pinned to the main service here.
  serviceMonitor:
    main:
      enabled: false  # set to true if you need metrics
      service:
        identifier: main
```

Or with Ingress:

```yaml
server:
  enabled: true
  ingress:
    main:
      enabled: true

      hosts:
        - host: immich.example.com
          paths:
            - path: /
              pathType: Prefix
              service:
                identifier: main
    immich-public-proxy:
      enabled: true
      hosts:
        - host: photos.example.com
          paths:
            - path: /
              pathType: Prefix
              service:
                identifier: immich-public-proxy
```
