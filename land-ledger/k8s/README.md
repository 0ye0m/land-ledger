# LAND LEDGER — Kubernetes manifests

Apply order (numbered for a reason):

```bash
# 0. ⚠️ Edit 02-secrets.yaml and 03-postgres.yaml first:
#    replace every "REPLACE_BEFORE_APPLY" placeholder with real credentials.

kubectl apply -f 00-namespace.yaml
kubectl apply -f 01-configmap.yaml
kubectl apply -f 02-secrets.yaml
kubectl apply -f 03-postgres.yaml
kubectl apply -f 04-blockchain.yaml
kubectl apply -f 05-backend.yaml
kubectl apply -f 06-frontend.yaml
kubectl apply -f 07-ingress.yaml
kubectl apply -f 08-monitoring.yaml
```

Or in one shot once secrets are filled in:

```bash
kubectl apply -f k8s/
```

## Loading images (local clusters)

Manifests reference locally built images (`land-ledger-*:latest`,
`imagePullPolicy: IfNotPresent`). For minikube / kind, push them into the
cluster first:

```bash
docker build -t land-ledger-backend:latest ./backend
docker build -t land-ledger-frontend:latest ./frontend
docker build -t land-ledger-blockchain:latest ./blockchain

minikube image load land-ledger-backend:latest land-ledger-frontend:latest land-ledger-blockchain:latest
# or (kind):  kind load docker-image land-ledger-backend:latest ...
```

## Notes

- `landledger.local` must resolve to the ingress controller IP
  (`minikube ip`, or `/etc/hosts` entry for kind).
- `/metrics` is deliberately NOT routed through the ingress; Prometheus
  uses the in-cluster `backend-metrics` Service (08-monitoring.yaml).
- The blockchain is a single Hardhat dev node — its chain state is
  ephemeral (in-memory), which is expected for this stage of the project.
