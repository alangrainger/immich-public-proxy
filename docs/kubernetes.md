# Install with Kubernetes

See the [official Immich docs](https://immich.app/docs/install/kubernetes/) for additional information. This deployment uses the common chart Immich depends on ([bjw-s common library chart](https://github.com/bjw-s-labs/helm-charts/tree/common-5.0.1/charts/library/common)) to extend the deployment as described in the [Immich docs](https://github.com/immich-app/immich-charts/blob/main/README.md)

1. Simply modify the values of your immich deployment in the server section. The next example shows using the new Gateway API HTTPRoute, below you can also find the old Ingress version. This uses 
```
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
        - your-immich-url.com
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
        - your-proxy-url.com
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
            tag: 3.2.0
            pullPolicy: IfNotPresent
          env:
            IMMICH_URL: https://your-immich-url.com // You could also reference the service here
            PUBLIC_BASE_URL: https://your-proxy-url.com

  service:
    immich-public-proxy:
      controller: immich-public-proxy
      type: ClusterIP
      ports:
        http:
          port: 3000

  serviceMonitor: // We modify the ServiceMonitor here, as the bjw-s common chart can get confused with more than 1 service (main and immich-public-proxy)
    main:
      enabled: false // Set to true if you need metrics
      service:
        identifier: main
```

Or with Ingress
```
server:
  enabled: true
  ingress:
    main:
      enabled: true

      hosts:
        - host: your-immich-url.com
          paths:
            - path: /
              pathType: Prefix
              service:
                identifier: main
    immich-public-proxy:
      enabled: true
      hosts:
        - host: your-proxy-url.com
          paths:
            - path: /
              pathType: Prefix
              service:
                identifier: immich-public-proxy
...
```


